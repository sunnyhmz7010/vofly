import { cx } from "../../lib/utils";
import { Button } from "./Button";
import { tl, useI18n } from "../../lib/i18n";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  details?: string;
  statusCode?: number;
  requestMethod?: string;
  requestUrl?: string;
  lastSuccessAt?: number | null;
  retryText?: string;
  onRetry?: () => void;
  className?: string;
}

// ErrorState: red panel describing a failed load with optional retry.
export function ErrorState({
  title,
  message,
  details,
  statusCode,
  requestMethod,
  requestUrl,
  lastSuccessAt,
  retryText,
  onRetry,
  className,
}: ErrorStateProps) {
  const { t } = useI18n();
  const meta: string[] = [];
  if (statusCode) meta.push(`HTTP ${statusCode}`);
  const method = (requestMethod || "").toUpperCase();
  if (method && requestUrl) meta.push(`${method} ${requestUrl}`);
  else if (requestUrl) meta.push(String(requestUrl));
  if (lastSuccessAt) meta.push(`${tl("最后成功：")}${new Date(lastSuccessAt).toLocaleString()}`);

  return (
    <div className={cx("rounded-2xl border border-red-100 bg-red-50/70 p-6 dark:border-red-500/20 dark:bg-red-500/10", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-red-700 dark:text-red-300">{title ?? t("加载失败")}</div>
          {message ? <div className="mt-1 break-words text-xs text-red-700/80 dark:text-red-200/80">{message}</div> : null}
          {meta.length ? (
            <div className="mt-2 break-words font-mono text-[11px] text-red-800/60 dark:text-red-100/60">{meta.join(" · ")}</div>
          ) : null}
          {details ? (
            <div className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-red-900/60 dark:text-red-100/60">{details}</div>
          ) : null}
        </div>
        {retryText ? (
          <Button variant="primary" onClick={onRetry} className="!border-0">
            {retryText}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
