import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Qtx1wReceiver, type ReceiverMeta } from "../lib/qtx1w/receiver";

// 离线扫码接收页：手机摄像头扫描电脑屏幕上的 QTX1-W 动态二维码并重组文件。
// 页面无登录、独立路由，可在无法访问服务器的网络下使用。

type CameraState = "idle" | "starting" | "scanning" | "error" | "completed";

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
    };
  }
}

const SCAN_INTERVAL_MS = 60;

export default function QrReceivePage() {
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [usingNativeDetector, setUsingNativeDetector] = useState(false);

  const [meta, setMeta] = useState<ReceiverMeta | null>(null);
  const [received, setReceived] = useState(0);
  const [total, setTotal] = useState(0);
  const [completed, setCompleted] = useState<{ url: string; name: string; size: number } | null>(null);
  const [lastEventText, setLastEventText] = useState("等待扫描…");
  const [flashDetected, setFlashDetected] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStateRef = useRef<CameraState>("idle");

  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastScanAtRef = useRef(0);
  const flashTimerRef = useRef<number | null>(null);
  const receiverRef = useRef(new Qtx1wReceiver());
  const nativeDetectorRef = useRef<InstanceType<NonNullable<Window["BarcodeDetector"]>> | null>(null);

  const secureContextOk = window.isSecureContext;

  const setCamera = useCallback((state: CameraState) => {
    cameraStateRef.current = state;
    setCameraState(state);
  }, []);

  const stopCamera = useCallback(() => {
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (cameraStateRef.current === "scanning") setCamera("idle");
  }, [setCamera]);

  const finishReception = useCallback(
    (name: string, mimeType: string, bytes: Uint8Array) => {
      const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeType });
      setCompleted({ url: URL.createObjectURL(blob), name, size: bytes.length });
      setReceived(receiverRef.current.total);
      setTotal(receiverRef.current.total);
      setCamera("completed");
      stopCamera();
    },
    [setCamera, stopCamera],
  );

  const handleDecoded = useCallback(
    (text: string) => {
      const receiver = receiverRef.current;
      const result = receiver.feed(text);
      setFlashDetected(true);
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => setFlashDetected(false), 120);
      switch (result.event) {
        case "meta":
          setMeta(result.meta);
          setReceived(0);
          setTotal(result.meta.totalChunks);
          setCompleted(null);
          setLastEventText(`发现文件 ${result.meta.name}`);
          break;
        case "progress":
          setReceived(result.received);
          setTotal(result.total);
          setLastEventText(`接收分片 ${result.received}/${result.total}，缺失分片将在下一轮补发`);
          break;
        case "round_end":
          setLastEventText(
            receiver.isComplete ? "校验中…" : `本轮结束，${receiver.receivedCount}/${receiver.total}，继续接收补发轮次`,
          );
          break;
        case "complete":
          finishReception(result.file.name, result.file.mimeType, result.file.bytes);
          break;
        default:
          break;
      }
    },
    [finishReception],
  );

  const readNextFrame = useCallback(async (): Promise<string | null> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const detector = nativeDetectorRef.current;
    if (detector) {
      const results = await detector.detect(video);
      return results.length > 0 ? results[0].rawValue : null;
    }
    const canvas = canvasRef.current;
    if (!video.videoWidth || !video.videoHeight || !canvas) return null;
    const scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    const result = jsQR(image.data, width, height, { inversionAttempts: "dontInvert" });
    return result ? result.data : null;
  }, []);

  const scanLoopRef = useRef<() => void>(() => undefined);
  const scanLoop = useCallback(() => {
    if (cameraStateRef.current !== "scanning") return;
    rafIdRef.current = requestAnimationFrame(async (timestamp) => {
      if (timestamp - lastScanAtRef.current < SCAN_INTERVAL_MS) {
        scanLoopRef.current();
        return;
      }
      lastScanAtRef.current = timestamp;
      try {
        const text = await readNextFrame();
        if (text && text.startsWith("QTX1")) handleDecoded(text);
      } catch {
        // 单帧解码失败不影响后续帧
      }
      if (cameraStateRef.current === "scanning") scanLoopRef.current();
    });
  }, [handleDecoded, readNextFrame]);
  scanLoopRef.current = scanLoop;

  const startCamera = useCallback(async () => {
    if (cameraStateRef.current === "starting" || cameraStateRef.current === "scanning") return;
    if (!secureContextOk) {
      setErrorMessage("摄像头需要 HTTPS 或 localhost 安全上下文，请通过 HTTPS 访问本页一次以启用离线缓存");
      setCamera("error");
      return;
    }
    setCamera("starting");
    setErrorMessage("");
    try {
      if (typeof window.BarcodeDetector === "function") {
        nativeDetectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
        setUsingNativeDetector(true);
      } else {
        nativeDetectorRef.current = null;
        setUsingNativeDetector(false);
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCamera("scanning");
      setLastEventText("对准电脑屏幕上的二维码");
      scanLoop();
    } catch (error) {
      setCamera("error");
      setErrorMessage(error instanceof Error ? `摄像头启动失败：${error.message}` : "摄像头启动失败");
    }
  }, [scanLoop, secureContextOk, setCamera]);

  useEffect(() => {
    // 预注册 Service Worker 以支持离线复用；文件缺失时静默失败。
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return stopCamera;
  }, [stopCamera]);

  function resetTransfer() {
    receiverRef.current.reset();
    setMeta(null);
    setReceived(0);
    setTotal(0);
    setCompleted(null);
    setLastEventText("等待扫描…");
    if (streamRef.current) {
      setCamera("scanning");
      scanLoop();
    } else {
      setCamera("idle");
    }
  }

  function saveFile() {
    if (!completed) return;
    const link = document.createElement("a");
    link.href = completed.url;
    link.download = completed.name;
    link.click();
  }

  const sizeLabel = meta
    ? meta.size / 1024 >= 1024
      ? `${(meta.size / 1024 / 1024).toFixed(2)} MB`
      : `${(meta.size / 1024).toFixed(1)} KB`
    : "";
  const progressPercent = total > 0 ? Math.round((received / total) * 100) : 0;

  return (
    <div className="min-h-dvh bg-[var(--ui-bg,#f4f6fb)] px-4 py-6 dark:bg-slate-950">
      <main className="mx-auto w-full max-w-md space-y-4">
        <header className="text-center">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">二维码接收</h1>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">QTX1-W · 扫描屏幕动态二维码接收文件</p>
        </header>

        {!secureContextOk ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            当前页面不在 HTTPS 安全上下文，浏览器不允许访问摄像头。请在可联网时通过 HTTPS 打开本页完成缓存。
          </div>
        ) : null}

        <div className="relative overflow-hidden rounded-2xl border border-black/10 bg-black dark:border-white/15">
          <video ref={videoRef} playsInline muted className="block aspect-[3/4] w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div
            className={`pointer-events-none absolute inset-6 rounded-xl border-2 transition-colors ${
              flashDetected ? "border-emerald-400" : "border-white/35"
            }`}
          />
          {cameraState === "idle" || cameraState === "error" ? (
            <div className="absolute inset-0 grid place-items-center bg-black/70 px-6 text-center">
              <p className="text-sm text-gray-200">{errorMessage || "点击下方按钮开启摄像头"}</p>
            </div>
          ) : null}
          {cameraState === "completed" ? (
            <div className="absolute inset-0 grid place-items-center bg-emerald-600/90 px-6 text-center">
              <p className="text-sm font-bold text-white">接收完成，已通过 SHA-256 校验</p>
            </div>
          ) : null}
        </div>

        {cameraState === "idle" || cameraState === "error" ? (
          <button
            type="button"
            className="w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-50"
            disabled={!secureContextOk}
            onClick={() => void startCamera()}
          >
            开启摄像头
          </button>
        ) : null}

        {meta ? (
          <section className="space-y-2 rounded-2xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <strong className="min-w-0 truncate text-sm text-gray-900 dark:text-white">{meta.name}</strong>
              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{sizeLabel}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full rounded-full bg-sky-500 transition-all duration-200" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">{lastEventText}</p>
            <p className="text-[11px] text-gray-400">
              会话 {meta.sessionId} · 解码方式：{usingNativeDetector ? "系统 BarcodeDetector" : "jsQR"}
            </p>
          </section>
        ) : null}

        {completed ? (
          <button
            type="button"
            className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white hover:bg-emerald-600"
            onClick={saveFile}
          >
            保存文件（{completed.name}）
          </button>
        ) : null}

        {meta ? (
          <button
            type="button"
            className="w-full rounded-xl border border-black/10 py-2.5 text-xs font-bold text-gray-600 hover:bg-black/5 dark:border-white/20 dark:text-gray-300 dark:hover:bg-white/10"
            onClick={resetTransfer}
          >
            {cameraState === "completed" ? "接收下一个文件" : "重置本次接收"}
          </button>
        ) : null}

        <footer className="pt-2 text-center text-[11px] leading-relaxed text-gray-400">
          本页支持离线使用：首次请在能访问 vofly 的网络下打开一次，之后即可在任意网络下扫码接收。传输内容经 CRC32 与
          SHA-256 双重校验。
        </footer>
      </main>
    </div>
  );
}
