import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, apiMessage } from "../api";

export type NotificationQRChannel = "weixin" | "wecom-bot" | "qq";
export type NotificationQRStatus = "wait" | "scaned" | "confirmed" | "applied" | "expired" | "canceled" | "error";
export type NotificationQRTone = "neutral" | "active" | "success" | "warning" | "danger";

export interface NotificationQRSession {
  sessionId: string;
  taskId?: string;
  qrUrl?: string;
  openUrl?: string;
  expiresAt?: string;
  status: NotificationQRStatus;
  applied?: boolean;
  applyWarning?: string;
  error?: string;
  appId?: string;
  userOpenid?: string;
  botId?: string;
  botAccountId?: string;
  botUserId?: string;
  baseUrl?: string;
}

export interface NotificationQRPresentation {
  label: string;
  tone: NotificationQRTone;
}

export const POLL_INTERVAL_MS = 1500;

export function notificationQRStartPath(channel: NotificationQRChannel) {
  return `/settings/notifications/${channel}/qr/start`;
}

export function notificationQRStatusPath(channel: NotificationQRChannel, sessionID: string) {
  return `/settings/notifications/${channel}/qr/status?session_id=${encodeURIComponent(sessionID)}`;
}

export function notificationQRCancelPath(channel: NotificationQRChannel) {
  return `/settings/notifications/${channel}/qr/cancel`;
}

export function isNotificationQRActive(session: NotificationQRSession | null): boolean {
  return session?.status === "wait" || session?.status === "scaned";
}

export function notificationQROpenURL(session: NotificationQRSession | null): string {
  const explicit = String(session?.openUrl || "").trim();
  if (explicit) return explicit;
  const qrURL = String(session?.qrUrl || "").trim();
  return /^https:\/\//i.test(qrURL) ? qrURL : "";
}

export function notificationQRPresentation(
  session: NotificationQRSession | null,
  connected: boolean,
): NotificationQRPresentation {
  if (!session) {
    return connected ? { label: "已连接", tone: "success" } : { label: "尚未创建扫码会话", tone: "neutral" };
  }
  if (session.status === "wait") return { label: "等待扫码", tone: "active" };
  if (session.status === "scaned") return { label: "已扫码，请在手机端确认", tone: "active" };
  if (session.status === "expired") return { label: "已过期", tone: "warning" };
  if (session.status === "canceled") return { label: "已取消", tone: "warning" };
  if (session.status === "error") return { label: "连接失败", tone: "danger" };
  if (session.applied || session.status === "applied" || session.status === "confirmed") return { label: "已连接", tone: "success" };
  return { label: "连接失败", tone: "danger" };
}

export const notificationOnboardingService = {
  start(channel: NotificationQRChannel, payload: { baseUrl?: string } = {}) {
    return api<NotificationQRSession>(notificationQRStartPath(channel), {
      method: "POST",
      body: payload,
    });
  },
  status(channel: NotificationQRChannel, sessionID: string) {
    return api<NotificationQRSession>(notificationQRStatusPath(channel, sessionID));
  },
  async cancel(channel: NotificationQRChannel, sessionID: string) {
    await api(notificationQRCancelPath(channel), {
      method: "POST",
      body: { sessionId: sessionID },
    });
    return true;
  },
};

export interface UseNotificationQROptions {
  onApplied?: (session: NotificationQRSession) => Promise<void> | void;
}

export function useNotificationQR(channel: NotificationQRChannel, options: UseNotificationQROptions = {}) {
  const [session, setSession] = useState<NotificationQRSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const sessionRef = useRef<NotificationQRSession | null>(null);
  const onAppliedRef = useRef(options.onApplied);

  useEffect(() => {
    onAppliedRef.current = options.onApplied;
  }, [options.onApplied]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback((currentGeneration: number, nextSession: NotificationQRSession | null) => {
    clearTimer();
    if (!isNotificationQRActive(nextSession) || currentGeneration !== generationRef.current) return;
    timerRef.current = window.setTimeout(() => {
      void poll(currentGeneration);
    }, POLL_INTERVAL_MS);
  }, [clearTimer]);

  const poll = useCallback(async (currentGeneration = generationRef.current) => {
    const sessionID = sessionRef.current?.sessionId;
    if (!sessionID || currentGeneration !== generationRef.current) return;
    setPolling(true);
    try {
      const next = await notificationOnboardingService.status(channel, sessionID);
      if (currentGeneration !== generationRef.current) return;
      setSession(next);
      sessionRef.current = next;
      setError(next.error || next.applyWarning || "");
      if (next.applied || next.status === "applied" || next.status === "confirmed") {
        await onAppliedRef.current?.(next);
      }
      schedule(currentGeneration, next);
    } catch (e) {
      if (currentGeneration === generationRef.current) setError(apiMessage(e));
    } finally {
      if (currentGeneration === generationRef.current) setPolling(false);
    }
  }, [channel, schedule]);

  const cancelCurrent = useCallback(async (reset = true) => {
    clearTimer();
    const sessionID = sessionRef.current?.sessionId;
    generationRef.current += 1;
    if (reset) {
      setSession(null);
      sessionRef.current = null;
      setError("");
    }
    if (!sessionID) return;
    try {
      await notificationOnboardingService.cancel(channel, sessionID);
    } catch (e) {
      if (reset) setError(apiMessage(e));
    }
  }, [channel, clearTimer]);

  const start = useCallback(async (payload: { baseUrl?: string } = {}) => {
    await cancelCurrent(false);
    const currentGeneration = generationRef.current + 1;
    generationRef.current = currentGeneration;
    setSession(null);
    sessionRef.current = null;
    setLoading(true);
    setError("");
    try {
      const next = await notificationOnboardingService.start(channel, payload);
      if (currentGeneration !== generationRef.current) return;
      setSession(next);
      sessionRef.current = next;
      setError(next.error || next.applyWarning || "");
      if (next.applied || next.status === "applied" || next.status === "confirmed") {
        await onAppliedRef.current?.(next);
      }
      schedule(currentGeneration, next);
    } catch (e) {
      if (currentGeneration === generationRef.current) setError(apiMessage(e));
    } finally {
      if (currentGeneration === generationRef.current) setLoading(false);
    }
  }, [cancelCurrent, channel, schedule]);

  useEffect(() => {
    return () => {
      clearTimer();
      const current = sessionRef.current;
      generationRef.current += 1;
      if (current?.sessionId && isNotificationQRActive(current)) {
        void notificationOnboardingService.cancel(channel, current.sessionId).catch(() => {});
      }
    };
  }, [channel, clearTimer]);

  const active = useMemo(() => isNotificationQRActive(session), [session]);

  return {
    session,
    loading,
    polling,
    error,
    active,
    start,
    cancel: () => cancelCurrent(true),
  };
}
