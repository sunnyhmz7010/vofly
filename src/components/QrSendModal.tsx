import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DismissRegular, QrCode24Regular } from "@fluentui/react-icons";
import { estimateRoundMs, frameDurationMs } from "../lib/qtx1w/playback";
import type { ReadyReply } from "../lib/qtx1w/qrWorker";
import { Button, Modal } from "./ui";

export type QrSendPayload = {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
};

type QrSendModalProps = {
  open: boolean;
  payload: QrSendPayload | null;
  onClose: () => void;
};

type QueuedFrame = {
  entry: number;
  round: number;
  displayIndex: number;
  scheduleCount: number;
  size: number;
  modules: Uint8Array;
};

type WorkerReply =
  | ReadyReply
  | {
      type: "frame";
      entry: number;
      round: number;
      displayIndex: number;
      scheduleCount: number;
      size: number;
      modules: ArrayBuffer;
    }
  | { type: "error"; message: string };

const FPS_OPTIONS = [6, 10, 15, 20];
const CHUNK_SIZE = 2800;
const OUTSTANDING_REQUESTS = 6;

function appReceiveUrl(): string {
  return `${window.location.origin}/qr-receive`;
}

function formatSize(bytes: number): string {
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
}

function copyPayloadBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export function QrSendModal({ open, payload, onClose }: QrSendModalProps) {
  const [fps, setFps] = useState(15);
  const [sessionId, setSessionId] = useState("");
  const [totalChunks, setTotalChunks] = useState(0);
  const [fileSize, setFileSize] = useState(0);
  const [round, setRound] = useState(0);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [scheduleCount, setScheduleCount] = useState(0);
  const [sentFrames, setSentFrames] = useState(0);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextAtRef = useRef(0);
  const queueRef = useRef<QueuedFrame[]>([]);
  const outstandingRef = useRef(0);
  const stoppedRef = useRef(true);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenSizeRef = useRef(0);
  const fpsRef = useRef(fps);

  useEffect(() => {
    fpsRef.current = fps;
  }, [fps]);

  const sizeLabel = useMemo(() => formatSize(fileSize), [fileSize]);
  const roundEstimateLabel = useMemo(() => {
    if (!totalChunks) return "";
    const seconds = Math.round(estimateRoundMs(totalChunks, fps) / 100) / 10;
    return `约 ${seconds} 秒/轮`;
  }, [fps, totalChunks]);

  const drawFrame = useCallback((frame: QueuedFrame) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const quietModules = 4;
    const totalModules = frame.size + quietModules * 2;
    if (!offscreenRef.current || offscreenSizeRef.current !== frame.size) {
      offscreenRef.current = document.createElement("canvas");
      offscreenRef.current.width = frame.size;
      offscreenRef.current.height = frame.size;
      offscreenSizeRef.current = frame.size;
    }
    const offscreen = offscreenRef.current;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    const image = offCtx.createImageData(frame.size, frame.size);
    const pixels = image.data;
    let cursor = 0;
    for (let index = 0; index < frame.modules.length; index++) {
      const value = frame.modules[index] === 1 ? 0 : 255;
      pixels[cursor++] = value;
      pixels[cursor++] = value;
      pixels[cursor++] = value;
      pixels[cursor++] = 255;
    }
    offCtx.putImageData(image, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const moduleSize = canvas.width / totalModules;
    ctx.drawImage(
      offscreen,
      quietModules * moduleSize,
      quietModules * moduleSize,
      frame.size * moduleSize,
      frame.size * moduleSize,
    );
  }, []);

  const scheduleNextTick = useCallback(
    (now: number) => {
      if (stoppedRef.current) return;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      const frame = queueRef.current.shift() ?? null;
      if (!frame) {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          if (!stoppedRef.current && queueRef.current.length > 0) {
            nextAtRef.current = performance.now();
            scheduleNextTick(nextAtRef.current);
          }
        }, 16);
        return;
      }

      drawFrame(frame);
      setRound(frame.round);
      setDisplayIndex(frame.displayIndex);
      setScheduleCount(frame.scheduleCount);
      setSentFrames((value) => value + 1);
      const duration = frameDurationMs(frame.entry, fpsRef.current, frame.round, frame.displayIndex);
      nextAtRef.current = Math.max(now, nextAtRef.current) + duration;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        scheduleNextTick(performance.now());
      }, Math.max(0, nextAtRef.current - performance.now()));
    },
    [drawFrame],
  );

  const requestNext = useCallback(() => {
    if (stoppedRef.current || !workerRef.current || outstandingRef.current >= OUTSTANDING_REQUESTS) return;
    outstandingRef.current++;
    workerRef.current.postMessage({ type: "next" });
  }, []);

  const stopPlaybackOnly = useCallback(() => {
    stoppedRef.current = true;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
  }, []);

  const stopSession = useCallback(() => {
    stopPlaybackOnly();
    workerRef.current?.terminate();
    workerRef.current = null;
    queueRef.current = [];
    outstandingRef.current = 0;
    nextAtRef.current = 0;
    setSessionId("");
    setTotalChunks(0);
    setFileSize(0);
    setRound(0);
    setDisplayIndex(0);
    setScheduleCount(0);
    setSentFrames(0);
  }, [stopPlaybackOnly]);

  const handleWorkerMessage = useCallback(
    (reply: WorkerReply) => {
      if (stoppedRef.current) return;
      if (reply.type === "ready") {
        setSessionId(reply.sessionId);
        setTotalChunks(reply.totalChunks);
        setFileSize(reply.fileSize);
        return;
      }
      if (reply.type === "error") {
        setError(reply.message);
        stopPlaybackOnly();
        return;
      }
      outstandingRef.current = Math.max(0, outstandingRef.current - 1);
      queueRef.current.push({
        entry: reply.entry,
        round: reply.round,
        displayIndex: reply.displayIndex,
        scheduleCount: reply.scheduleCount,
        size: reply.size,
        modules: new Uint8Array(reply.modules),
      });
      requestNext();
      if (timerRef.current === null && queueRef.current.length > 0) {
        scheduleNextTick(performance.now());
      }
    },
    [requestNext, scheduleNextTick, stopPlaybackOnly],
  );

  const startSession = useCallback(() => {
    stopSession();
    if (!payload) return;
    setError("");
    stoppedRef.current = false;
    queueRef.current = [];
    outstandingRef.current = 0;

    try {
      workerRef.current = new Worker(new URL("../lib/qtx1w/qrWorker.ts", import.meta.url), { type: "module" });
    } catch {
      setError("当前浏览器不支持 Web Worker，无法启动二维码发送");
      stoppedRef.current = true;
      return;
    }

    workerRef.current.onmessage = (event: MessageEvent<WorkerReply>) => handleWorkerMessage(event.data);
    workerRef.current.onerror = () => {
      setError("二维码生成线程异常退出");
      stopPlaybackOnly();
    };

    const transferBuffer = copyPayloadBuffer(payload.bytes);
    workerRef.current.postMessage(
      {
        type: "init",
        data: transferBuffer,
        fileName: payload.name,
        mimeType: payload.mimeType,
        chunkSize: CHUNK_SIZE,
      },
      [transferBuffer],
    );
    for (let index = 0; index < OUTSTANDING_REQUESTS; index++) {
      requestNext();
    }
    setRunning(true);
  }, [handleWorkerMessage, payload, requestNext, stopPlaybackOnly, stopSession]);

  useEffect(() => {
    if (open && payload) {
      startSession();
      return;
    }
    if (!open) {
      stopSession();
    }
  }, [open, payload, startSession, stopSession]);

  useEffect(() => stopSession, [stopSession]);

  function close() {
    stopSession();
    onClose();
  }

  const chunkCount = payload ? Math.max(1, Math.ceil(payload.bytes.length / CHUNK_SIZE)) : 0;

  return (
    <Modal open={open} onClose={close} title="二维码传输" width="max-w-xl" closeOnOverlay={false}>
      <div className="space-y-4">
        {payload ? (
          <div className="rounded-xl bg-black/5 p-3 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300">
            <div className="font-bold">{payload.name}</div>
            <div className="mt-1">
              {sizeLabel} · {chunkCount} 个数据分片
              {roundEstimateLabel ? ` · ${roundEstimateLabel}` : ""}
            </div>
          </div>
        ) : null}

        <div className="relative overflow-hidden rounded-xl border border-black/10 dark:border-white/15">
          <canvas ref={canvasRef} width={880} height={880} className="block aspect-square w-full bg-white" />
          {!running ? (
            <div className="absolute inset-0 grid place-items-center bg-white/85 text-sm text-gray-500 dark:bg-black/70 dark:text-gray-300">
              {error || "正在准备会话…"}
            </div>
          ) : null}
        </div>

        {running ? (
          <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
            <div>
              会话 ID：<span className="font-mono font-bold">{sessionId}</span>
            </div>
            <div>
              第 {round} 轮 · 本轮第 {displayIndex}/{scheduleCount} 帧 · 已发送 {sentFrames} 帧
            </div>
            <div className="text-amber-600 dark:text-amber-400">
              二维码对周围可见：请勿在公共环境传输敏感文件；保持手机摄像头对准屏幕直至手机端校验完成。
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            发送速度
            <select
              value={fps}
              className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs dark:border-white/20 dark:bg-slate-800"
              onChange={(event) => {
                setFps(Number(event.target.value));
                nextAtRef.current = performance.now();
              }}
            >
              {FPS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} 帧/秒
                </option>
              ))}
            </select>
          </label>
          <Button variant="danger" plain size="small" onClick={close} icon={<DismissRegular />}>
            结束发送
          </Button>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
          <QrCode24Regular className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            手机打开「{appReceiveUrl()}」扫码接收。发送端循环补发缺失分片，全部收齐并通过 SHA-256 校验后才会保存。
          </span>
        </div>
      </div>
    </Modal>
  );
}
