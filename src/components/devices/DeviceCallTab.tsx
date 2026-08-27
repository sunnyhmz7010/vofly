import { useCallback, useEffect, useRef, useState } from "react";
import { CallRegular, MicRegular, Speaker0Regular } from "@fluentui/react-icons";
import { api, apiMessage } from "../../api";
import { Button, Input, StatusDot, Tag } from "../ui";
import { tf, useI18n } from "../../lib/i18n";

type CallState = "ringing" | "active" | "ended" | "failed" | string;

interface CallItem {
  id: string;
  number: string;
  direction: string;
  state: CallState;
  startedAt?: string;
  answeredAt?: string;
  sipCode?: number;
  reason?: string;
  mediaReady?: boolean;
  codec?: string;
  endedAt?: string;
}

interface CallsPayload {
  deviceId: string;
  transport: "vowifi" | "cellular" | string;
  calls: CallItem[];
}

function isActiveCall(call: CallItem) {
  return call.state !== "ended" && call.state !== "failed";
}

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(startedAt: string | undefined, endedAt?: string) {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return "";
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function stateLabel(state: CallState, t: (text: string) => string): { text: string; tone: "success" | "danger" | "warning" | "info" } {
  switch (state) {
    case "ringing":
      return { text: t("响铃中"), tone: "warning" };
    case "active":
      return { text: t("通话中"), tone: "success" };
    case "failed":
      return { text: t("失败"), tone: "danger" };
    case "ended":
      return { text: t("已结束"), tone: "info" };
    default:
      return { text: state, tone: "info" };
  }
}

const SAMPLE_RATE = 8000;

/**
 * Bridges browser microphone/speaker audio with the backend IMS RTP stream.
 * The WebSocket carries little-endian signed 16-bit mono samples at 8 kHz,
 * matching the backend contract in call_media_api.go.
 */
class CallAudioBridge {
  private socket: WebSocket | null = null;
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private playbackBuffer: Int16Array[] = [];
  onStateChange: (connected: boolean) => void = () => {};

  async start(deviceId: string, callId: string) {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(
      `${protocol}://${window.location.host}/api/devices/${deviceId}/calls/media?call_id=${encodeURIComponent(callId)}`,
    );
    socket.binaryType = "arraybuffer";
    this.socket = socket;

    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.context = context;

    socket.onopen = async () => {
      this.onStateChange(true);
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
        this.source = context.createMediaStreamSource(this.stream);
        const processor = context.createScriptProcessor(2048, 1, 1);
        this.processor = processor;
        processor.onaudioprocess = (event) => {
          if (!socket || socket.readyState !== WebSocket.OPEN) return;
          const input = event.inputBuffer.getChannelData(0);
          const payload = new ArrayBuffer(input.length * 2);
          const view = new DataView(payload);
          for (let index = 0; index < input.length; index++) {
            const clamped = Math.max(-1, Math.min(1, input[index]));
            view.setInt16(index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
          }
          socket.send(payload);
        };
        this.source.connect(processor);
        // Keep the processor pulling samples; the uplink must not reach speakers.
        const silence = context.createGain();
        silence.gain.value = 0;
        processor.connect(silence);
        silence.connect(context.destination);
      } catch {
        // Microphone unavailable: downlink playback still works.
      }
    };

    socket.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer) || !this.context) return;
      const samples = new Int16Array(event.data);
      this.playbackBuffer.push(samples);
      this.drainPlayback();
    };

    socket.onclose = () => this.onStateChange(false);
    socket.onerror = () => this.onStateChange(false);
  }

  private drainPlayback() {
    const context = this.context;
    if (!context || context.state === "suspended") return;
    while (this.playbackBuffer.length > 0) {
      const samples = this.playbackBuffer.shift();
      if (!samples) continue;
      const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index++) {
        channel[index] = samples[index] / 0x8000;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start();
    }
  }

  stop() {
    this.socket?.close(1000);
    this.socket = null;
    this.processor?.disconnect();
    this.processor = null;
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.playbackBuffer = [];
    void this.context?.close();
    this.context = null;
    this.onStateChange(false);
  }
}

export function DeviceCallTab({ deviceId, active }: { deviceId: string; active: boolean }) {
  const { t } = useI18n();
  const [payload, setPayload] = useState<CallsPayload | null>(null);
  const [loadError, setLoadError] = useState("");
  const [dialNumber, setDialNumber] = useState("");
  const [dialing, setDialing] = useState(false);
  const [acting, setActing] = useState(false);
  const [mediaConnected, setMediaConnected] = useState(false);
  const bridgeRef = useRef<CallAudioBridge | null>(null);
  const mediaCallIdRef = useRef<string>("");

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ data: CallsPayload }>(`/devices/${deviceId}/calls`);
      setPayload(res.data);
      setLoadError("");
    } catch (error) {
      setLoadError(apiMessage(error));
    }
  }, [deviceId]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  const activeCall = payload?.calls.find(isActiveCall) || null;
  const history = payload?.calls.filter((call) => !isActiveCall(call)) || [];
  const transport = payload?.transport || "";

  // Manage the browser audio bridge for an active VoWiFi call.
  useEffect(() => {
    const wantMedia =
      active &&
      transport === "vowifi" &&
      !!activeCall &&
      activeCall.state === "active" &&
      activeCall.mediaReady === true;
    const callId = activeCall?.id || "";
    if (wantMedia && !mediaConnected && mediaCallIdRef.current !== callId) {
      mediaCallIdRef.current = callId;
      const bridge = new CallAudioBridge();
      bridge.onStateChange = setMediaConnected;
      bridgeRef.current = bridge;
      void bridge.start(deviceId, callId);
    } else if ((!wantMedia || mediaCallIdRef.current !== callId) && bridgeRef.current) {
      bridgeRef.current.stop();
      bridgeRef.current = null;
      mediaCallIdRef.current = "";
    }
  }, [active, transport, activeCall, mediaConnected, deviceId]);

  useEffect(() => {
    return () => {
      bridgeRef.current?.stop();
      bridgeRef.current = null;
    };
  }, []);

  function validNumber(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 2 || trimmed.length > 32) return false;
    return /^[+]?[0-9*#]+$/.test(trimmed);
  }

  async function dial() {
    const number = dialNumber.trim();
    if (!number || !validNumber(number) || dialing) return;
    setDialing(true);
    try {
      await api(`/devices/${deviceId}/calls/dial`, { method: "POST", body: { number } });
      setDialNumber("");
      await refresh();
    } catch (error) {
      window.alert(apiMessage(error));
    } finally {
      setDialing(false);
    }
  }

  async function act(action: "answer" | "hangup", callId: string) {
    if (acting) return;
    setActing(true);
    try {
      await api(`/devices/${deviceId}/calls/${action}`, {
        method: "POST",
        body: callId ? { call_id: callId } : {},
      });
      await refresh();
    } catch (error) {
      window.alert(apiMessage(error));
    } finally {
      setActing(false);
    }
  }

  const vowifiReady = transport === "vowifi";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400">
            <CallRegular className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{t("VoWiFi 通话")}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {transport === "vowifi"
                ? t("通过网页麦克风和扬声器进行 IMS 通话")
                : t("当前为基站直连（电路交换）通话，网页音频仅 VoWiFi IMS 通话可用")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          <StatusDot tone={vowifiReady ? "success" : "neutral"} />
          {vowifiReady ? t("VoWiFi IMS") : t("未注册 IMS")}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200/80 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <label className="mb-2 block text-xs font-bold text-gray-500 dark:text-gray-400">{t("拨号号码")}</label>
        <div className="flex gap-2">
          <Input
            value={dialNumber}
            onChange={(event) => setDialNumber(event.target.value)}
            placeholder={t("例如 +12025550123 或 *100#")}
            disabled={dialing}
            onKeyDown={(event) => {
              if (event.key === "Enter") void dial();
            }}
          />
          <Button variant="primary" loading={dialing} onClick={() => void dial()} icon={<CallRegular />}>
            {t("拨打")}
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{t("支持 +、数字、*、#；拨号请求不会自动挂断。")}</p>
      </div>

      {mediaConnected ? (
        <div className="flex items-center gap-2 text-xs font-medium text-green-600 dark:text-green-400">
          <MicRegular className="h-4 w-4" />
          <Speaker0Regular className="h-4 w-4" />
          {t("网页音频已桥接当前通话")}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{t("当前通话")}</h4>
        <Button variant="text" loading={false} onClick={() => void refresh()}>
          {t("刷新")}
        </Button>
      </div>

      {loadError ? (
        <p className="text-sm text-red-500">{loadError}</p>
      ) : activeCall ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-500/30 dark:bg-sky-500/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{activeCall.number || t("未知号码")}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {activeCall.direction === "outgoing" ? t("呼出") : t("呼入")} · {formatTime(activeCall.startedAt)}
                {activeCall.state === "active" ? ` · ${formatDuration(activeCall.startedAt)}` : ""}
              </div>
              {activeCall.reason ? (
                <div className="mt-1 text-sm text-red-500">
                  {activeCall.sipCode ? `${activeCall.sipCode} ` : ""}
                  {activeCall.reason}
                </div>
              ) : null}
            </div>
            <Tag type={stateLabel(activeCall.state, t).tone}>{stateLabel(activeCall.state, t).text}</Tag>
          </div>
          <div className="mt-3 flex gap-2">
            {activeCall.state === "ringing" ? (
              <Button variant="primary" loading={acting} onClick={() => void act("answer", activeCall.id)}>
                {t("接听")}
              </Button>
            ) : null}
            <Button variant="danger" loading={acting} onClick={() => void act("hangup", activeCall.id)}>
              {t("挂断")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-white/10 dark:text-gray-500">
          {t("暂无进行中的通话")}
        </div>
      )}

      {history.length > 0 ? (
        <div>
          <h4 className="mb-2 text-sm font-bold text-gray-900 dark:text-gray-100">{t("通话记录")}</h4>
          <div className="space-y-2">
            {history.map((call) => (
              <div
                key={call.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-white/5"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-800 dark:text-gray-200">
                    {call.direction === "outgoing" ? t("呼出") : t("呼入")} · {call.number || t("未知号码")}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatTime(call.startedAt)}
                    {call.endedAt ? ` · ${formatDuration(call.startedAt, call.endedAt)}` : ""}
                    {call.reason ? ` · ${call.sipCode ? `${call.sipCode} ` : ""}${call.reason}` : ""}
                  </div>
                </div>
                <Tag type={stateLabel(call.state, t).tone}>{stateLabel(call.state, t).text}</Tag>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
