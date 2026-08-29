import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CallRegular, MicRegular, QrCode24Regular, Speaker0Regular } from "@fluentui/react-icons";
import { ApiError, api, apiMessage, camelize } from "../api";
import { QrSendModal, type QrSendPayload } from "../components/QrSendModal";
import { Button, Input, PageHeader, Select, StatusDot, Tag } from "../components/ui";
import { tf, useI18n } from "../lib/i18n";

// 独立通话页：跨设备拨号、当前通话、持久化通话记录与录音回放。
// 后端契约：/devices、/devices/{id}/calls、/devices/{id}/calls/{dial|answer|hangup}、
// /devices/{id}/calls/webrtc（WebRTC 音频优先）、/devices/{id}/calls/media（WebSocket PCM 桥兜底）、
// /call-records、/call-recordings/{id}。

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
  transport: "vowifi" | "cellular" | string;
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

const SAMPLE_RATE = 8000;

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

// 强制 PCMU/8000：从收发双端能力里去重挑选；浏览器不支持能力查询时返回空列表并沿用默认编解码。
function pcmuCodecPreferences(): RTCRtpCodec[] {
  const capabilities: RTCRtpCodec[] = [
    ...(RTCRtpSender.getCapabilities("audio")?.codecs ?? []),
    ...(RTCRtpReceiver.getCapabilities("audio")?.codecs ?? []),
  ];
  const unique = new Map<string, RTCRtpCodec>();
  for (const codec of capabilities) {
    if (codec.mimeType.toLowerCase() !== "audio/pcmu" || codec.clockRate !== SAMPLE_RATE) continue;
    unique.set(`${codec.mimeType}/${codec.clockRate}/${codec.channels ?? 1}`, codec);
  }
  return [...unique.values()];
}

// WebRTC 通话音频桥：建立成功返回 true；任何失败都返回 false，由调用方回退到 CallAudioBridge。
class CallWebRTCBridge {
  private pc: RTCPeerConnection | null = null;
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
      const track = stream.getAudioTracks()[0];
      if (track) void transceiver.sender.replaceTrack(track);
      const preferences = pcmuCodecPreferences();
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

  stop() {
    this.stopped = true;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
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

export default function PhonePage() {
  const { t } = useI18n();
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [callsPayload, setCallsPayload] = useState<CallsPayload | null>(null);
  const [loadError, setLoadError] = useState("");
  const [dialNumber, setDialNumber] = useState("");
  const [dialing, setDialing] = useState(false);
  const [acting, setActing] = useState(false);
  const [mediaConnected, setMediaConnected] = useState(false);
  const [records, setRecords] = useState<CallRecord[]>([]);
  const [qrPayload, setQrPayload] = useState<QrSendPayload | null>(null);
  const [qrPreparingId, setQrPreparingId] = useState("");
  const bridgeRef = useRef<CallAudioBridge | null>(null);
  const webrtcRef = useRef<CallWebRTCBridge | null>(null);
  const mediaCallIdRef = useRef("");
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const deviceOptions = useMemo(
    () => devices.map((device) => ({ value: device.id, label: device.name || device.id })),
    [devices],
  );

  const loadDevices = useCallback(async () => {
    try {
      const res = await api<{ devices?: DeviceListItem[] }>("/devices");
      const list = camelize<DeviceListItem[]>(res.devices || []);
      setDevices(list);
      setDeviceId((current) => current || list[0]?.id || "");
    } catch (error) {
      setLoadError(apiMessage(error));
    }
  }, []);

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

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (!deviceId) return;
    void refresh();
    void loadRecords();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [deviceId, refresh, loadRecords]);

  const activeCall = callsPayload?.calls.find(isActiveCall) || null;
  const transport = callsPayload?.transport || "";
  const vowifiReady = transport === "vowifi";

  useEffect(() => {
    const wantMedia =
      !!deviceId && vowifiReady && !!activeCall && activeCall.state === "active" && activeCall.mediaReady === true;
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
  }, [deviceId, vowifiReady, activeCall, mediaConnected]);

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
    if (!deviceId || !number || !validDialNumber(number) || dialing) return;
    setDialing(true);
    try {
      await api(`/devices/${encodeURIComponent(deviceId)}/calls/dial`, { method: "POST", body: { number } });
      setDialNumber("");
      await refresh();
      await loadRecords();
    } catch (error) {
      window.alert(apiMessage(error));
    } finally {
      setDialing(false);
    }
  }

  async function act(action: "answer" | "hangup", callId: string) {
    if (acting || !deviceId) return;
    setActing(true);
    try {
      await api(`/devices/${encodeURIComponent(deviceId)}/calls/${action}`, {
        method: "POST",
        body: callId ? { call_id: callId } : {},
      });
      await refresh();
      await loadRecords();
    } catch (error) {
      window.alert(apiMessage(error));
    } finally {
      setActing(false);
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
        mimeType: "audio/wav",
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
      <PageHeader title={t("通话")} subtitle={t("网页麦克风与扬声器 IMS 通话、通话记录与录音回放")} />

      {/* WebRTC 下行播放：隐藏元素，自动播放远端音轨 */}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

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
                <StatusDot tone={vowifiReady ? "success" : "neutral"} />
                {vowifiReady ? t("VoWiFi IMS") : t("未注册 IMS")}
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={dialNumber}
                onChange={(event) => setDialNumber(event.target.value)}
                placeholder={t("例如 +12025550123 或 *100#")}
                disabled={dialing || !deviceId}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void dial();
                }}
              />
              <Button variant="primary" loading={dialing} disabled={!deviceId} onClick={() => void dial()} icon={<CallRegular />}>
                {t("拨打")}
              </Button>
            </div>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{t("支持 +、数字、*、#；拨号请求不会自动挂断。")}</p>
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
                      {activeCall.direction === "outgoing" ? t("呼出") : t("呼入")} · {formatClock(activeCall.startedAt)}
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
                    <Button variant="primary" loading={acting} onClick={() => void act("answer", activeCall.id)}>
                      {t("接听")}
                    </Button>
                  ) : null}
                  <Button variant="danger" loading={acting} onClick={() => void act("hangup", activeCall.id)}>
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
                        {record.direction === "outgoing" ? t("呼出") : t("呼入")} · {record.number || t("未知号码")}
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
