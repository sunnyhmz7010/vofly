import { useEffect, useMemo, useState } from "react";
import {
  Dismiss20Regular,
  Open20Regular,
  QrCode24Regular,
} from "@fluentui/react-icons";
import QRCode from "qrcode";
import { useI18n } from "../../lib/i18n";
import { cx } from "../../lib/utils";
import {
  isNotificationQRActive,
  notificationQROpenURL,
  notificationQRPresentation,
  type NotificationQRSession,
  type NotificationQRTone,
} from "../../lib/notificationOnboarding";
import { Button } from "../ui/Button";

const TONE_CLASS: Record<NotificationQRTone, string> = {
  neutral: "text-gray-500 before:bg-gray-400",
  active: "text-[#0ea5e9] before:bg-[#0ea5e9]",
  success: "text-[#16a34a] before:bg-[#22c55e]",
  warning: "text-[#d97706] before:bg-[#f59e0b]",
  danger: "text-[#dc2626] before:bg-[#ef4444]",
};

export function NotificationQrConnect({
  title,
  connected,
  session,
  busy,
  polling,
  error,
  onStart,
  onCancel,
}: {
  title: string;
  connected: boolean;
  session: NotificationQRSession | null;
  busy: boolean;
  polling: boolean;
  error: string;
  onStart: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [qrDataURL, setQRDataURL] = useState("");
  const presentation = useMemo(() => notificationQRPresentation(session, connected), [connected, session]);
  const openURL = useMemo(() => notificationQROpenURL(session), [session]);
  const canCancel = isNotificationQRActive(session);

  useEffect(() => {
    let cancelled = false;
    const qrURL = String(session?.qrUrl || "").trim();
    if (!qrURL) {
      setQRDataURL("");
      return () => {
        cancelled = true;
      };
    }
    QRCode.toDataURL(qrURL, { errorCorrectionLevel: "M", margin: 1, width: 184 })
      .then((dataURL) => {
        if (!cancelled) setQRDataURL(dataURL);
      })
      .catch(() => {
        if (!cancelled) setQRDataURL("");
      });
    return () => {
      cancelled = true;
    };
  }, [session?.qrUrl]);

  return (
    <section
      aria-label={title}
      className="min-w-0 rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-gray-800 dark:text-gray-100">{title}</h4>
          <div
            className={cx(
              "mt-1 flex min-h-5 items-center gap-2 text-xs",
              "before:h-2 before:w-2 before:shrink-0 before:rounded-full",
              TONE_CLASS[presentation.tone],
            )}
            aria-live="polite"
          >
            <span>{t(presentation.label)}</span>
            <span className={cx("text-gray-400", polling ? "visible" : "invisible")}>{t("正在查询")}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {canCancel ? (
            <Button variant="default" disabled={busy} onClick={onCancel} aria-label={t("取消扫码")} icon={<Dismiss20Regular />}>
              {t("取消扫码")}
            </Button>
          ) : null}
          <Button variant="primary" loading={busy} onClick={onStart} icon={<QrCode24Regular />}>
            {session ? t("重新扫码") : t("扫码连接")}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid min-h-[216px] place-items-center rounded-lg border border-dashed border-gray-200 bg-white/70 dark:border-white/10 dark:bg-black/20">
        {qrDataURL ? (
          <div className="grid h-[200px] w-[200px] place-items-center rounded-lg bg-white p-2 shadow-sm">
            <img src={qrDataURL} alt={t("扫码连接")} width={184} height={184} />
          </div>
        ) : (
          <div className="grid place-items-center gap-2 text-center text-sm text-gray-400">
            <QrCode24Regular className="text-[34px]" />
            <span>{t("尚未创建扫码会话")}</span>
          </div>
        )}
      </div>

      {openURL ? (
        <div className="mt-3 flex justify-center">
          <a
            href={openURL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dcdfe6] bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:border-[#c6c8f0] hover:bg-[#f1f1fc] hover:text-[#0ea5e9] dark:border-white/15 dark:bg-white/5 dark:text-gray-200 dark:hover:border-[#0ea5e9]/50 dark:hover:bg-white/10 dark:hover:text-[#7dd3fc]"
          >
            <Open20Regular />
            <span>{t("在新窗口打开")}</span>
          </a>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 break-words text-sm leading-6 text-[#dc2626]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
