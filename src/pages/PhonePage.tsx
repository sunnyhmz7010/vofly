import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CallRegular, MicRegular, QrCode24Regular, Speaker0Regular } from "@fluentui/react-icons";
import { ApiError, api, apiMessage, camelize } from "../api";
import { QrSendModal, type QrSendPayload } from "../components/QrSendModal";
import { Button, Input, PageHeader, Select, StatusDot, type StatusTone, Tag } from "../components/ui";
import { tf, useI18n } from "../lib/i18n";
import { usePhoneControlLease } from "../lib/phoneLease";
import { requestedPhoneDeviceId } from "../lib/phoneNavigation";

// 独立通话页：跨设备拨号、当前通话、持久化通话记录与录音回放。
// 后端契约：/devices、/devices/{id}/calls、/devices/{id}/calls/{dial|answer|hangup}、
// /devices/{id}/calls/dtmf（通话中 DTMF）、/devices/{id}/calls/webrtc（WebRTC 音频优先）、
// /devices/{id}/calls/media（WebSocket PCM 桥兜底）、/call-records、/call-recordings/{id}。

interface DeviceListItem {
  id: string;
  name: string;
  online?: boolean;
}

interface CallItem {
  id: string;
  number: string;
  direction: string;
  state: string;
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
  transport: "vowifi" | "volte" | "cellular" | string;
  calls: CallItem[];
}

interface CallRecord {
  callId: string;
  deviceId: string;
  number: string;
  direction: string;
  state: string;
  sipCode?: number;
  reason?: string;
  startedAt?: string;
  answeredAt?: string;
  endedAt?: string;
  recordingPath?: string;
  recordingSeconds?: number;
}

interface AICallSession {
  id: string;
  callId: string;
  deviceId: string;
  number?: string;
  direction: string;
  state: string;
  provider: string;
  task?: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

interface AICallProvider {
  name: string;
  label: string;
  configured: boolean;
  supported: boolean;
  experimental?: boolean;
}

interface AICallPreset {
  id: string;
  label: string;
  number: string;
  task: string;
}

interface AICallEvent {
  id?: number;
  type: string;
  role?: string;
  text?: string;
  payloadJson?: string;
  createdAt?: string;
}

interface AICallSummary {
  state?: string;
  summaryJson?: string;
  error?: string;
}

interface CallRecordDetail {
  record: CallRecord;
  events: AICallEvent[];
  summary?: AICallSummary;
}

const SAMPLE_RATE = 8000;

function callTransportPresentation(transport: CallsPayload["transport"]): { text: string; tone: StatusTone; webAudioReady: boolean } {
  switch (transport) {
    case "vowifi":
      return { text: "VoWiFi IMS", tone: "success", webAudioReady: true };
    case "volte":
      return { text: "VoLTE IMS", tone: "success", webAudioReady: true };
    case "cellular":
      return { text: "蜂窝通话", tone: "warning", webAudioReady: false };
    default:
      return { text: "未注册 IMS", tone: "neutral", webAudioReady: false };
  }
}

function callDirectionLabel(direction: string) {
  switch (direction) {
    case "outgoing":
    case "outbound":
      return "呼出";
    case "incoming":
    case "inbound":
      return "呼入";
    default:
      return "未知";
  }
}

function isActiveCall(call: CallItem) {
  return call.state !== "ended" && call.state !== "failed";
}

function formatClock(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(startedAt: string | undefined, endedAt?: string) {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return "";
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function aiSummaryText(summary?: AICallSummary) {
  const raw = summary?.summaryJson?.trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const title = typeof parsed.title === "string" ? parsed.title : "";
    const text = typeof parsed.summary === "string" ? parsed.summary : "";
    return [title, text].filter(Boolean).join(" · ") || raw;
  } catch {
    return raw;
  }
}

function aiVerdictText(summary?: AICallSummary) {
  const raw = summary?.summaryJson?.trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { verdict?: Record<string, unknown> };
    const verdict = parsed.verdict;
    if (!verdict) return "";
    const conclusion = typeof verdict.conclusion === "string" ? verdict.conclusion : "";
    const review = verdict.needs_review === true ? "需复核" : "无需复核";
    const reason = typeof verdict.reasons === "string" ? verdict.reasons : "";
    return [conclusion, review, reason ? `原因：${reason}` : ""].filter(Boolean).join(" · ");
  } catch {
    return "";
  }
}

function aiVerificationText(summary?: AICallSummary) {
  const raw = summary?.summaryJson?.trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const verification = typeof parsed.result_verification === "string" ? parsed.result_verification : "";
    const source = typeof parsed.result_source === "string" ? parsed.result_source : "";
    if (verification === "verified" && source === "carrier_sms") return "运营商短信 · 已核实";
    if (verification === "unverified") return source === "transcript" ? "通话转写 · 待核实" : "待核实";
    return "";
  } catch {
    return "";
  }
}

function aiStructuredSummaryFields(summary?: AICallSummary) {
  const raw = summary?.summaryJson?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const fields: { label: string; value: string }[] = [];
    const addText = (key: string, label: string) => {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) fields.push({ label, value: value.trim() });
    };
    addText("caller_identity", "来电人");
    addText("intent", "来意");
    const urgency = typeof parsed.urgency === "string" ? parsed.urgency.trim().toLowerCase() : "";
    if (urgency) {
      fields.push({ label: "紧急程度", value: urgency === "high" ? "高" : urgency === "low" ? "低" : urgency === "medium" ? "中" : urgency });
    }
    if (typeof parsed.callback_needed === "boolean") {
      fields.push({ label: "是否回电", value: parsed.callback_needed ? "是" : "否" });
    }
    return fields;
  } catch {
    return [];
  }
}

function mergeAICallEvents(current: AICallEvent[], next: AICallEvent[]) {
  const merged = new Map<string, AICallEvent>();
  for (const event of [...current, ...next]) {
    const key = event.id ? String(event.id) : `${event.createdAt || ""}:${event.type}:${event.role || ""}:${event.text || ""}`;
    merged.set(key, event);
  }
  return [...merged.values()].sort((left, right) => (left.id || 0) - (right.id || 0));
}

function aiEventText(event: AICallEvent) {
  if (event.type === "transcript") return event.text || "";
  if (event.type === "tool_call") {
    try {
      const payload = JSON.parse(event.payloadJson || "{}") as { name?: string; result?: { code?: string } };
      return [payload.name, payload.result?.code].filter(Boolean).join(" · ") || "tool_call";
    } catch {
      return "tool_call";
    }
  }
  return event.text || event.type;
}

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
      `${protocol}://${window.location.host}/api/devices/${encodeURIComponent(deviceId)}/calls/media?call_id=${encodeURIComponent(callId)}`,
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
          if (socket.readyState !== WebSocket.OPEN) return;
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
        const silence = context.createGain();
        silence.gain.value = 0;
        processor.connect(silence);
        silence.connect(context.destination);
      } catch {
        // 麦克风不可用时仅保留下行播放
      }
    };

    socket.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer) || !this.context) return;
      this.playbackBuffer.push(new Int16Array(event.data));
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

function validDialNumber(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 32) return false;
  return /^[+]?[0-9*#]+$/.test(trimmed);
}

// 预期内的 WebRTC 回退状态：请求无效(400)、后端未提供端点(404)、非 VoWiFi 会话(501)、协商失败(502)。
const WEBRTC_FALLBACK_STATUSES = [400, 404, 501, 502];

// 强制 PCMU/8000 并保留 telephone-event：后者是浏览器端 DTMF（RTCRtpSender.insertDTMF）
// 能协商的前提。浏览器不支持能力查询时返回空列表并沿用默认编解码。
function callCodecPreferences(): RTCRtpCodec[] {
  const capabilities: RTCRtpCodec[] = [
    ...(RTCRtpSender.getCapabilities("audio")?.codecs ?? []),
    ...(RTCRtpReceiver.getCapabilities("audio")?.codecs ?? []),
  ];
  const unique = new Map<string, RTCRtpCodec>();
  for (const codec of capabilities) {
    const mime = codec.mimeType.toLowerCase();
    if (codec.clockRate !== SAMPLE_RATE) continue;
    if (mime !== "audio/pcmu" && mime !== "audio/telephone-event") continue;
    unique.set(`${mime}/${codec.clockRate}/${codec.channels ?? 1}`, codec);
  }
  return [...unique.values()];
}

// WebRTC 通话音频桥：建立成功返回 true；任何失败都返回 false，由调用方回退到 CallAudioBridge。
class CallWebRTCBridge {
  private pc: RTCPeerConnection | null = null;
  private transceiver: RTCRtpTransceiver | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private stopped = false;
  onStateChange: (connected: boolean) => void = () => {};

  async start(deviceId: string, callId: string, audio: HTMLAudioElement | null): Promise<boolean> {
    this.audio = audio;
    if (typeof RTCPeerConnection === "undefined") return false;
    const pc = new RTCPeerConnection();
    this.pc = pc;
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") this.onStateChange(true);
      else if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        this.onStateChange(false);
      }
    };
    pc.ontrack = (event) => {
      if (!this.audio) return;
      this.audio.srcObject = event.streams[0] || new MediaStream([event.track]);
      void this.audio.play().catch(() => {});
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (this.stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      this.stream = stream;
      const transceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
      this.transceiver = transceiver;
      const track = stream.getAudioTracks()[0];
      if (track) void transceiver.sender.replaceTrack(track);
      const preferences = callCodecPreferences();
      if (preferences.length > 0) transceiver.setCodecPreferences(preferences);
      await pc.setLocalDescription(await pc.createOffer());
      const offer = pc.localDescription?.sdp || "";
      if (this.stopped || !offer) return false;
      // 后端会按 call_id 替换既有挂载，因此重新 offer 是安全的。
      const answer = (
        await api<{ answer?: string }>(`/devices/${encodeURIComponent(deviceId)}/calls/webrtc`, {
          method: "POST",
          body: { call_id: callId, offer },
        })
      ).answer;
      if (this.stopped || !answer) return false;
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
      this.onStateChange(true);
      return true;
    } catch (error) {
      if (error instanceof ApiError && !WEBRTC_FALLBACK_STATUSES.includes(error.status)) {
        console.warn("WebRTC 通话媒体建立失败", error.status, apiMessage(error));
      }
      return false;
    }
  }

  // WebRTC 侧 DTMF：telephone-event 协商成功后从音频收发器取 sender 注入
  // RFC 4733 事件；协商失败或浏览器不支持时返回 false，由调用方走 REST 兜底。
  sendDTMF(digit: string, durationMs = 200): boolean {
    const dtmf = this.transceiver?.sender?.dtmf;
    if (!dtmf) return false;
    try {
      dtmf.insertDTMF(digit, durationMs);
      return true;
    } catch {
      return false;
    }
  }

  stop() {
    this.stopped = true;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.transceiver = null;
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      try {
        this.pc.close();
      } catch {
        /* 已关闭的连接直接忽略 */
      }
    }
    this.pc = null;
    if (this.audio) this.audio.srcObject = null;
    this.audio = null;
    this.onStateChange(false);
  }
}

function callRecordingFileName(callId: string) {
  const clean = callId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "recording";
  return `call_${clean}.wav`;
}

// 与 hideck 拨号盘一致的 12 键布局（1-9、*、0、#），字母提示便于记忆。
const DTMF_KEYS = [
  { digit: "1", letters: "" }, { digit: "2", letters: "ABC" }, { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" }, { digit: "5", letters: "JKL" }, { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" }, { digit: "8", letters: "TUV" }, { digit: "9", letters: "WXYZ" },
  { digit: "*", letters: "" }, { digit: "0", letters: "+" }, { digit: "#", letters: "" },
];

// QTX1-W 传输默认按 WAV 标注；录音引用以 .mp3 结尾时按实际编码标注为 MP3。
const QR_WAV_MIME_TYPE = "audio/wav";

function recordingMimeType(recordingPath: string | undefined) {
  return recordingPath && /\.mp3$/i.test(recordingPath) ? "audio/mpeg" : QR_WAV_MIME_TYPE;
}

export default function PhonePage() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [callsPayload, setCallsPayload] = useState<CallsPayload | null>(null);
  const [loadError, setLoadError] = useState("");
  const [dialNumber, setDialNumber] = useState("");
  const [dialing, setDialing] = useState(false);
  const [acting, setActing] = useState(false);
  const [aiTask, setAITask] = useState("");
  const [aiProvider, setAIProvider] = useState("fake");
  const [aiProviders, setAIProviders] = useState<AICallProvider[]>([]);
  const [aiPresets, setAIPresets] = useState<AICallPreset[]>([]);
  const [aiSessions, setAISessions] = useState<AICallSession[]>([]);
  const [aiCallEvents, setAICallEvents] = useState<AICallEvent[]>([]);
  const [aiBusy, setAIBusy] = useState(false);
  const [mediaConnected, setMediaConnected] = useState(false);
  const [records, setRecords] = useState<CallRecord[]>([]);
  const [recordDetail, setRecordDetail] = useState<CallRecordDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState("");
  const [dtmfSending, setDtmfSending] = useState(false);
  const [lastDTMF, setLastDTMF] = useState("");
  const [qrPayload, setQrPayload] = useState<QrSendPayload | null>(null);
  const [qrPreparingId, setQrPreparingId] = useState("");
  const bridgeRef = useRef<CallAudioBridge | null>(null);
  const webrtcRef = useRef<CallWebRTCBridge | null>(null);
  const mediaCallIdRef = useRef("");
  const aiEventCursorRef = useRef(0);
  const aiEventCallIdRef = useRef("");
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  // 多标签页控制租约：同一活动通话仅允许一个标签页操作，其余只读观察（对齐 hideck）。
  const { controlsLocked, claim, release } = usePhoneControlLease();

  const deviceOptions = useMemo(
    () => devices.map((device) => ({ value: device.id, label: device.name || device.id })),
    [devices],
  );
  const aiProviderOptions = useMemo(
    () =>
      (aiProviders.length > 0 ? aiProviders : [{ name: "fake", label: "fake", configured: true, supported: true }])
        .filter((provider) => provider.supported && provider.configured)
        .map((provider) => ({
          value: provider.name,
          label: provider.experimental ? `${provider.label}（实验）` : provider.label,
        })),
    [aiProviders],
  );
  const aiPresetOptions = useMemo(
    () => [
      { value: "", label: t("不使用预设") },
      ...aiPresets.map((preset) => ({ value: preset.id, label: preset.label })),
    ],
    [aiPresets, t],
  );

  const loadDevices = useCallback(async () => {
    try {
      const res = await api<{ devices?: DeviceListItem[] }>("/devices");
      const list = camelize<DeviceListItem[]>(res.devices || []);
      setDevices(list);
      const requested = requestedPhoneDeviceId(`?${searchParams.toString()}`);
      setDeviceId((current) => {
        if (requested && list.some((device) => device.id === requested)) return requested;
        if (current && list.some((device) => device.id === current)) return current;
        return list[0]?.id || "";
      });
    } catch (error) {
      setLoadError(apiMessage(error));
    }
  }, [searchParams]);

  const refresh = useCallback(async () => {
    if (!deviceId) return;
    try {
      const res = await api<{ data: CallsPayload }>(`/devices/${encodeURIComponent(deviceId)}/calls`);
      setCallsPayload(res.data);
      setLoadError("");
    } catch (error) {
      setLoadError(apiMessage(error));
    }
  }, [deviceId]);

  const loadRecords = useCallback(async () => {
    try {
      const res = await api<{ data: CallRecord[] }>("/call-records?limit=100");
      setRecords(res.data || []);
    } catch {
      // 记录加载失败不阻塞拨号
    }
  }, []);

  const loadAISessions = useCallback(async () => {
    try {
      const res = await api<{ data: AICallSession[] }>("/ai-calls");
      const raw = Array.isArray(res) ? res : res.data || [];
      setAISessions(camelize<AICallSession[]>(raw));
    } catch {
      // AI 会话列表加载失败不影响人工通话控制。
    }
  }, []);

  const loadAIProviders = useCallback(async () => {
    try {
      const res = await api<{ data: AICallProvider[] }>("/ai-call-providers");
      const providers = camelize<AICallProvider[]>(res.data || []);
      setAIProviders(providers);
      setAIProvider((current) => {
        if (providers.some((provider) => provider.name === current && provider.supported && provider.configured)) return current;
        return providers.find((provider) => provider.supported && provider.configured)?.name || "fake";
      });
    } catch {
      setAIProviders([{ name: "fake", label: "fake", configured: true, supported: true }]);
      setAIProvider("fake");
    }
  }, []);

  const loadAIPresets = useCallback(async () => {
    try {
      const res = await api<{ data: AICallPreset[] }>("/ai-call-presets");
      setAIPresets(camelize<AICallPreset[]>(res.data || []));
    } catch {
      setAIPresets([]);
    }
  }, []);

  const loadAICallEvents = useCallback(async (callId: string) => {
    if (!callId) return;
    try {
      const res = await api<{ data: { events?: AICallEvent[]; nextAfterId?: number } }>(
        `/call-records/${encodeURIComponent(callId)}/events?after_id=${aiEventCursorRef.current}&limit=50`,
      );
      const data = camelize<{ events?: AICallEvent[]; nextAfterId?: number }>(res.data || {});
      const events = camelize<AICallEvent[]>(data.events || []);
      if (typeof data.nextAfterId === "number") aiEventCursorRef.current = data.nextAfterId;
      if (events.length > 0) setAICallEvents((current) => mergeAICallEvents(current, events));
    } catch {
      // 实时事件只增强通话观察能力，失败时保留当前会话控制。
    }
  }, []);

  useEffect(() => {
    void loadDevices();
    void loadAIProviders();
    void loadAIPresets();
  }, [loadDevices, loadAIProviders, loadAIPresets]);

  function applyAIPreset(presetID: string) {
    const preset = aiPresets.find((item) => item.id === presetID);
    if (!preset) return;
    setDialNumber(preset.number);
    setAITask(preset.task);
  }

  useEffect(() => {
    if (!deviceId) return;
    void refresh();
    void loadRecords();
    void loadAISessions();
    const timer = window.setInterval(() => void refresh(), 3000);
    const aiTimer = window.setInterval(() => void loadAISessions(), 3000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(aiTimer);
    };
  }, [deviceId, refresh, loadRecords, loadAISessions]);

  const activeCall = callsPayload?.calls.find(isActiveCall) || null;
  const activeAISession =
    aiSessions.find((session) => session.deviceId === deviceId && session.state !== "ended" && session.state !== "failed") || null;
  const structuredSummaryFields = useMemo(() => aiStructuredSummaryFields(recordDetail?.summary), [recordDetail?.summary]);
  const transport = callsPayload?.transport || "";
  const transportPresentation = callTransportPresentation(transport);
  const webAudioReady = transportPresentation.webAudioReady;
  const dtmfAvailable = transport === "vowifi" || transport === "volte";

  useEffect(() => {
    const callId = activeAISession?.callId || "";
    if (!callId) {
      aiEventCallIdRef.current = "";
      aiEventCursorRef.current = 0;
      setAICallEvents([]);
      return;
    }
    if (aiEventCallIdRef.current !== callId) {
      aiEventCallIdRef.current = callId;
      aiEventCursorRef.current = 0;
      setAICallEvents([]);
    }
    void loadAICallEvents(callId);
    const aiEventsTimer = window.setInterval(() => void loadAICallEvents(callId), 2000);
    return () => window.clearInterval(aiEventsTimer);
  }, [activeAISession?.callId, loadAICallEvents]);

  // 通话切换或结束后清空最近按键提示。
  useEffect(() => {
    setLastDTMF("");
  }, [activeCall?.id]);

  // 通话结束（含对端挂断）时释放控制租约，避免无主租约锁住其他标签页。
  const lastActiveCallIdRef = useRef("");
  useEffect(() => {
    const callId = activeCall?.id || "";
    const previous = lastActiveCallIdRef.current;
    lastActiveCallIdRef.current = callId;
    if (previous && !callId) release();
  }, [activeCall, release]);

  useEffect(() => {
    const wantMedia =
      !!deviceId && webAudioReady && !!activeCall && activeCall.state === "active" && activeCall.mediaReady === true;
    const callId = activeCall?.id || "";
    if (wantMedia && !mediaConnected && mediaCallIdRef.current !== callId) {
      mediaCallIdRef.current = callId;
      // 优先尝试 WebRTC（后端按 call_id 挂载 RTP 桥），未建立时回退到 WebSocket PCM 桥。
      const webrtc = new CallWebRTCBridge();
      webrtc.onStateChange = setMediaConnected;
      webrtcRef.current = webrtc;
      void webrtc.start(deviceId, callId, remoteAudioRef.current).then((established) => {
        if (established || webrtcRef.current !== webrtc) return;
        webrtcRef.current = null;
        const bridge = new CallAudioBridge();
        bridge.onStateChange = setMediaConnected;
        bridgeRef.current = bridge;
        void bridge.start(deviceId, callId);
      });
    } else if ((!wantMedia || mediaCallIdRef.current !== callId) && (bridgeRef.current || webrtcRef.current)) {
      bridgeRef.current?.stop();
      bridgeRef.current = null;
      webrtcRef.current?.stop();
      webrtcRef.current = null;
      mediaCallIdRef.current = "";
    }
  }, [deviceId, webAudioReady, activeCall, mediaConnected]);

  useEffect(
    () => () => {
      bridgeRef.current?.stop();
      webrtcRef.current?.stop();
      mediaCallIdRef.current = "";
    },
    [],
  );

  async function dial() {
    const number = dialNumber.trim();
    if (controlsLocked || !deviceId || !number || !validDialNumber(number) || dialing) return;
    setDialing(true);
    claim(); // 拨号即声明控制权（最新声明胜出，可接管其他标签页的陈旧/漏看租约）
    try {
      await api(`/devices/${encodeURIComponent(deviceId)}/calls/dial`, { method: "POST", body: { number } });
      setDialNumber("");
      await refresh();
      await loadRecords();
    } catch (error) {
      release(); // 拨号失败：本次声明不作数
      window.alert(apiMessage(error));
    } finally {
      setDialing(false);
    }
  }

  async function act(action: "answer" | "hangup", callId: string) {
    if (controlsLocked || acting || !deviceId) return;
    setActing(true);
    claim(); // 接听/挂断即声明控制权（最新声明胜出）
    try {
      await api(`/devices/${encodeURIComponent(deviceId)}/calls/${action}`, {
        method: "POST",
        body: callId ? { call_id: callId } : {},
      });
      if (action === "hangup") release(); // 挂断成功即释放租约
      await refresh();
      await loadRecords();
    } catch (error) {
      if (action === "answer") release(); // 接听失败：本次声明不作数
      window.alert(apiMessage(error));
    } finally {
      setActing(false);
    }
  }

  async function startAICall() {
    const number = dialNumber.trim();
    if (controlsLocked || !deviceId || !number || !validDialNumber(number) || aiBusy) return;
    setAIBusy(true);
    claim();
    try {
      await api(`/devices/${encodeURIComponent(deviceId)}/ai-calls/dial`, {
        method: "POST",
        body: { number, task: aiTask.trim(), provider: aiProvider },
      });
      setDialNumber("");
      await refresh();
      await loadAISessions();
      await loadRecords();
    } catch (error) {
      release();
      window.alert(apiMessage(error));
    } finally {
      setAIBusy(false);
    }
  }

  async function answerWithAI() {
    if (controlsLocked || !deviceId || !activeCall || aiBusy) return;
    setAIBusy(true);
    claim();
    try {
      await api(`/devices/${encodeURIComponent(deviceId)}/ai-calls/${encodeURIComponent(activeCall.id)}/answer`, {
        method: "POST",
        body: { task: aiTask.trim(), provider: aiProvider },
      });
      await refresh();
      await loadAISessions();
    } catch (error) {
      release();
      window.alert(apiMessage(error));
    } finally {
      setAIBusy(false);
    }
  }

  async function hangupAICall(sessionId: string) {
    if (controlsLocked || !sessionId || aiBusy) return;
    setAIBusy(true);
    try {
      await api(`/ai-calls/${encodeURIComponent(sessionId)}/hangup`, { method: "POST", body: {} });
      release();
      await refresh();
      await loadAISessions();
      await loadRecords();
    } catch (error) {
      window.alert(apiMessage(error));
    } finally {
      setAIBusy(false);
    }
  }

  async function updateAIInstructions() {
    if (controlsLocked || !activeAISession || aiBusy || !aiTask.trim()) return;
    setAIBusy(true);
    try {
      await api(`/ai-calls/${encodeURIComponent(activeAISession.id)}/instructions`, {
        method: "POST",
        body: { instructions: aiTask.trim() },
      });
      await loadAISessions();
      await loadAICallEvents(activeAISession.callId);
    } catch (error) {
      window.alert(apiMessage(error));
    } finally {
      setAIBusy(false);
    }
  }

  async function loadRecordDetail(record: CallRecord) {
    if (recordDetail?.record?.callId === record.callId) {
      setRecordDetail(null);
      return;
    }
    setDetailLoadingId(record.callId);
    try {
      const res = await api<{ data: CallRecordDetail } | CallRecordDetail>(`/call-records/${encodeURIComponent(record.callId)}`);
      const raw = "data" in res ? res.data : res;
      setRecordDetail(camelize<CallRecordDetail>(raw));
    } catch (error) {
      window.alert(apiMessage(error));
    } finally {
      setDetailLoadingId("");
    }
  }

  // 通话中发送一位 DTMF：WebRTC 桥接时先经 sender.dtmf 注入浏览器侧事件；
  // 设备侧 REST 始终兜底 —— WebRTC 桥不向 IMS 转发 telephone-event，
  // 运营商听到的按键音必须由设备媒体通道发送（对齐 hideck 的服务端发送路径）。
  async function sendDTMF(digit: string) {
    if (controlsLocked || !deviceId || !activeCall || dtmfSending) return;
    setDtmfSending(true);
    claim(); // 发送按键前声明控制权（最新声明胜出）
    setLastDTMF(digit);
    try {
      webrtcRef.current?.sendDTMF(digit);
      await api(`/devices/${encodeURIComponent(deviceId)}/calls/dtmf`, {
        method: "POST",
        body: { call_id: activeCall.id, digits: digit },
      });
    } catch (error) {
      window.alert(apiMessage(error));
    } finally {
      setDtmfSending(false);
    }
  }

  async function sendRecordingAsQr(record: CallRecord) {
    if (qrPreparingId) return;
    setQrPreparingId(record.callId);
    try {
      const response = await fetch(`/api/call-recordings/${encodeURIComponent(record.callId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`${t("录音读取失败")}（HTTP ${response.status}）`);
      }
      const buffer = await response.arrayBuffer();
      setQrPayload({
        name: callRecordingFileName(record.callId),
        mimeType: recordingMimeType(record.recordingPath),
        bytes: new Uint8Array(buffer),
      });
    } catch (error) {
      window.alert(apiMessage(error));
    } finally {
      setQrPreparingId("");
    }
  }

  function stateBadge(state: string): { text: string; type: "success" | "danger" | "warning" | "info" } {
    switch (state) {
      case "ringing":
        return { text: t("响铃中"), type: "warning" };
      case "active":
        return { text: t("通话中"), type: "success" };
      case "failed":
        return { text: t("失败"), type: "danger" };
      case "ended":
        return { text: t("已结束"), type: "info" };
      default:
        return { text: state, type: "info" };
    }
  }

  return (
    <div className="phone-page mx-auto w-full max-w-[1500px]">
      <PageHeader title={t("通话")} />

      {/* WebRTC 下行播放：隐藏元素，自动播放远端音轨 */}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {/* 控制权在其他标签页：只读观察横幅（状态轮询不受影响） */}
      {controlsLocked ? (
        <p
          role="status"
          className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
        >
          {t("通话控制已被另一个标签页接管")}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="space-y-4">
          <div className="ui-card p-5">
            <label className="mb-2 block text-xs font-bold text-gray-500 dark:text-gray-400">{t("选择设备")}</label>
            <Select
              value={deviceId}
              onChange={setDeviceId}
              options={deviceOptions}
              placeholder={t("选择要拨号的设备")}
            />
            <div className="mt-3 flex items-center justify-between">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400">{t("拨号号码")}</label>
              <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                <StatusDot tone={transportPresentation.tone} />
                {t(transportPresentation.text)}
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={dialNumber}
                onChange={(event) => setDialNumber(event.target.value)}
                placeholder={t("例如 +12025550123 或 *100#")}
                disabled={dialing || !deviceId || controlsLocked}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void dial();
                }}
              />
              <Button
                variant="primary"
                loading={dialing}
                disabled={!deviceId || controlsLocked}
                onClick={() => void dial()}
                icon={<CallRegular />}
              >
                {t("拨打")}
              </Button>
            </div>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{t("支持 +、数字、*、#；拨号请求不会自动挂断。")}</p>
          </div>

          <div className="ui-card p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{t("AI 通话")}</h3>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {t("让 AI 接管当前来电，或按上方号码发起 AI 外呼。")}
                </p>
              </div>
              <Tag type={activeAISession ? "success" : "info"}>
                {activeAISession ? t("AI 接管中") : t("待命")}
              </Tag>
            </div>
            {aiPresets.length > 0 ? (
              <div className="mb-3">
                <label className="mb-2 block text-xs font-bold text-gray-500 dark:text-gray-400">{t("预设任务")}</label>
                <Select value="" onChange={applyAIPreset} options={aiPresetOptions} />
              </div>
            ) : null}
            <label className="mb-2 block text-xs font-bold text-gray-500 dark:text-gray-400">{t("任务目标")}</label>
            <Input
              value={aiTask}
              onChange={(event) => setAITask(event.target.value)}
              placeholder={t("例如：确认套餐余量并记录关键信息")}
              disabled={controlsLocked || aiBusy}
            />
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Select value={aiProvider} onChange={setAIProvider} options={aiProviderOptions} />
              <Button
                variant="primary"
                loading={aiBusy}
                disabled={controlsLocked || !deviceId || !validDialNumber(dialNumber)}
                onClick={() => void startAICall()}
              >
                {t("AI 外呼")}
              </Button>
              {activeCall?.state === "ringing" ? (
                <Button
                  variant="primary"
                  loading={aiBusy}
                  disabled={controlsLocked || !deviceId}
                  onClick={() => void answerWithAI()}
                >
                  {t("AI 接管")}
                </Button>
              ) : null}
            </div>
            {activeAISession ? (
              <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {activeAISession.provider || "fake"} · {activeAISession.state} ·{" "}
                    {activeAISession.number || activeAISession.callId}
                  </span>
                  <Button
                    size="small"
                    variant="danger"
                    loading={aiBusy}
                    disabled={controlsLocked}
                    onClick={() => void hangupAICall(activeAISession.id)}
                  >
                    {t("结束 AI 通话")}
                  </Button>
                  <Button
                    size="small"
                    plain
                    variant="primary"
                    loading={aiBusy}
                    disabled={controlsLocked || !aiTask.trim()}
                    onClick={() => void updateAIInstructions()}
                  >
                    {t("更新任务")}
                  </Button>
                </div>
                {activeAISession.task ? <p className="mt-2">{activeAISession.task}</p> : null}
                {activeAISession.error ? <p className="mt-2 text-red-500">{activeAISession.error}</p> : null}
                <div className="mt-3 border-t border-sky-200/70 pt-3 dark:border-sky-500/20">
                  <div className="font-bold">{t("AI 实时事件")}</div>
                  {aiCallEvents.length > 0 ? (
                    <div className="mt-2 max-h-40 space-y-1 overflow-auto">
                      {aiCallEvents.map((event, index) => (
                        <p key={event.id ?? index} className="text-sky-700 dark:text-sky-200">
                          <span className="font-semibold">
                            {event.type === "transcript" ? event.role || "ai" : event.type === "tool_call" ? "tool_call" : event.type}：
                          </span>
                          {aiEventText(event)}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sky-500/80 dark:text-sky-300/80">{t("等待 AI 转写或状态事件")}</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {loadError ? <p className="text-sm text-red-500">{loadError}</p> : null}

          <div className="ui-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{t("当前通话")}</h3>
              <Button variant="text" onClick={() => void refresh()}>
                {t("刷新")}
              </Button>
            </div>
            {activeCall ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-500/30 dark:bg-sky-500/10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {activeCall.number || t("未知号码")}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {t(callDirectionLabel(activeCall.direction))} · {formatClock(activeCall.startedAt)}
                      {activeCall.state === "active" ? ` · ${formatDuration(activeCall.startedAt)}` : ""}
                    </div>
                    {activeCall.reason ? (
                      <div className="mt-1 text-sm text-red-500">
                        {activeCall.sipCode ? `${activeCall.sipCode} ` : ""}
                        {activeCall.reason}
                      </div>
                    ) : null}
                  </div>
                  <Tag type={stateBadge(activeCall.state).type}>{stateBadge(activeCall.state).text}</Tag>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {activeCall.state === "ringing" ? (
                    <Button variant="primary" loading={acting} disabled={controlsLocked} onClick={() => void act("answer", activeCall.id)}>
                      {t("接听")}
                    </Button>
                  ) : null}
                  <Button variant="danger" loading={acting} disabled={controlsLocked} onClick={() => void act("hangup", activeCall.id)}>
                    {t("挂断")}
                  </Button>
                  {mediaConnected ? (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
                      <MicRegular className="h-4 w-4" />
                      <Speaker0Regular className="h-4 w-4" />
                      {t("网页音频已桥接当前通话")}
                    </span>
                  ) : null}
                </div>
                {activeCall.state === "active" && dtmfAvailable ? (
                  <div className="mt-4 border-t border-sky-200/70 pt-3 dark:border-sky-500/20">
                    <div className="mb-2 flex items-center justify-between text-xs font-bold text-gray-500 dark:text-gray-400">
                      <span>{t("DTMF 拨号键")}</span>
                      {lastDTMF ? (
                        <span aria-live="polite">{tf("已发送：{digit}", { digit: lastDTMF })}</span>
                      ) : null}
                    </div>
                    <div className="grid max-w-[264px] grid-cols-3 gap-2" role="group" aria-label={t("DTMF 拨号键")}>
                      {DTMF_KEYS.map((key) => (
                        <button
                          key={key.digit}
                          type="button"
                          disabled={dtmfSending || controlsLocked}
                          aria-label={key.letters ? `${key.digit}（${key.letters}）` : key.digit}
                          onClick={() => void sendDTMF(key.digit)}
                          className="flex h-12 flex-col items-center justify-center rounded-lg border border-gray-200 bg-white/70 text-gray-900 transition hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:hover:border-sky-500/60 dark:hover:bg-sky-500/10"
                        >
                          <span className="font-mono text-lg leading-none">{key.digit}</span>
                          <small className="mt-1 min-h-[12px] text-[9px] tracking-[0.12em] text-gray-400">
                            {key.letters || "\u00a0"}
                          </small>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-white/10 dark:text-gray-500">
                {t("暂无进行中的通话")}
              </div>
            )}
          </div>
        </section>

        <section className="ui-card p-5">
          <h3 className="mb-3 text-sm font-bold text-gray-900 dark:text-gray-100">{t("通话记录与录音")}</h3>
          {records.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-white/10 dark:text-gray-500">
              {t("暂无通话记录")}
            </div>
          ) : (
            <div className="space-y-2">
              {records.map((record) => (
                <div key={record.callId} className="rounded-xl border border-gray-100 px-3 py-2.5 dark:border-white/5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {t(callDirectionLabel(record.direction))} · {record.number || t("未知号码")}
                      </div>
                      <div className="text-xs text-gray-400">
                        {formatClock(record.startedAt)}
                        {record.endedAt ? ` · ${formatDuration(record.startedAt, record.endedAt)}` : ""}
                        {record.reason ? ` · ${record.sipCode ? `${record.sipCode} ` : ""}${record.reason}` : ""}
                      </div>
                    </div>
                    <Tag type={stateBadge(record.state).type}>{stateBadge(record.state).text}</Tag>
                  </div>
                  {record.recordingPath ? (
                    <div className="mt-2 space-y-2">
                      <audio
                        controls
                        preload="none"
                        className="h-8 w-full"
                        src={`/api/call-recordings/${encodeURIComponent(record.callId)}`}
                      />
                      <Button
                        size="small"
                        plain
                        variant="primary"
                        loading={qrPreparingId === record.callId}
                        disabled={!!qrPreparingId && qrPreparingId !== record.callId}
                        onClick={() => void sendRecordingAsQr(record)}
                        icon={<QrCode24Regular />}
                      >
                        {t("二维码发送")}
                      </Button>
                    </div>
                  ) : null}
                  <div className="mt-2">
                    <Button
                      size="small"
                      plain
                      variant="primary"
                      loading={detailLoadingId === record.callId}
                      disabled={!!detailLoadingId && detailLoadingId !== record.callId}
                      onClick={() => void loadRecordDetail(record)}
                    >
                      {t("AI 通话详情")}
                    </Button>
                  </div>
                  {recordDetail?.record?.callId === record.callId ? (
                    <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50/80 p-3 text-xs dark:border-white/10 dark:bg-white/5">
                      <div className="font-bold text-gray-600 dark:text-gray-300">{t("AI 转写")}</div>
                      {recordDetail.events.filter((event) => event.type === "transcript" && event.text).length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {recordDetail.events
                            .filter((event) => event.type === "transcript" && event.text)
                            .map((event, index) => (
                              <p key={event.id ?? index} className="text-gray-500 dark:text-gray-400">
                                <span className="font-semibold">{event.role || "ai"}：</span>
                                {event.text}
                              </p>
                            ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-gray-400">{t("暂无 AI 转写")}</p>
                      )}
                      <div className="mt-3 font-bold text-gray-600 dark:text-gray-300">{t("AI 时间线")}</div>
                      {recordDetail.events.filter((event) => event.type !== "transcript").length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {recordDetail.events
                            .filter((event) => event.type !== "transcript")
                            .map((event, index) => (
                              <p key={event.id ?? index} className="text-gray-500 dark:text-gray-400">
                                <span className="font-semibold">
                                  {event.type}
                                  {event.createdAt ? ` · ${formatClock(event.createdAt)}` : ""}：
                                </span>
                                {aiEventText(event)}
                              </p>
                            ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-gray-400">{t("暂无 AI 时间线事件")}</p>
                      )}
                      <div className="mt-3 font-bold text-gray-600 dark:text-gray-300">{t("AI 摘要")}</div>
                      {aiSummaryText(recordDetail.summary) ? (
                        <p className="mt-2 text-gray-500 dark:text-gray-400">{aiSummaryText(recordDetail.summary)}</p>
                      ) : (
                        <p className="mt-2 text-gray-400">{t("暂无 AI 摘要")}</p>
                      )}
                      {structuredSummaryFields.length > 0 ? (
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {structuredSummaryFields.map((field) => (
                            <div key={field.label} className="rounded-lg border border-gray-100 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                              <div className="text-[11px] font-bold text-gray-400">{t(field.label)}</div>
                              <div className="mt-1 text-gray-600 dark:text-gray-300">{t(field.value)}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 font-bold text-gray-600 dark:text-gray-300">{t("结果核实")}</div>
                      {aiVerificationText(recordDetail.summary) ? (
                        <p className="mt-2 text-gray-500 dark:text-gray-400">{aiVerificationText(recordDetail.summary)}</p>
                      ) : (
                        <p className="mt-2 text-gray-400">{t("暂无结果核实")}</p>
                      )}
                      <div className="mt-3 font-bold text-gray-600 dark:text-gray-300">{t("任务判定")}</div>
                      {aiVerdictText(recordDetail.summary) ? (
                        <p className="mt-2 text-gray-500 dark:text-gray-400">{aiVerdictText(recordDetail.summary)}</p>
                      ) : (
                        <p className="mt-2 text-gray-400">{t("暂无任务判定")}</p>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {records.length > 0 ? (
            <p className="mt-3 text-[11px] text-gray-400">{tf("共 {count} 条记录", { count: records.length })}</p>
          ) : null}
        </section>
      </div>
      <QrSendModal open={!!qrPayload} payload={qrPayload} onClose={() => setQrPayload(null)} />
    </div>
  );
}
