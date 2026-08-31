import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowTrendingDownRegular, ArrowTrendingRegular, SubtractRegular } from "@fluentui/react-icons";
import { api, apiMessage } from "../../api";
import { balanceChangeTag, cardBalanceQueriesPath, type QueryCardContext } from "../../lib/queryCenter";
import { usePolling } from "../../lib/usePolling";
import { tf, tl, useI18n } from "../../lib/i18n";
import { Button, ErrorState, message, Spinner, Tag } from "../ui";
import type { BalanceQuery } from "../../types";

const HISTORY_LIMIT = 20;

function stateTag(state: BalanceQuery["state"]): { text: string; type: "success" | "danger" | "warning" | "info" } {
  switch (state) {
    case "completed":
      return { text: tl("已完成"), type: "success" };
    case "failed":
      return { text: tl("失败"), type: "danger" };
    case "timed_out":
      return { text: tl("已超时"), type: "warning" };
    case "awaiting_reply":
      return { text: tl("等待回复"), type: "warning" };
    default:
      return { text: tl("发送中"), type: "info" };
  }
}

function formatTime(value?: string): string {
  if (!value) return "";
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? "" : time.toLocaleString();
}

// BalancePanel 展示当前卡余额：当前解析余额、最近变化、查询状态与历史。
// 查看非激活 Profile 只读取数据，绝不触发切卡；「立即查询」由后端按需切卡。
export function BalancePanel({
  deviceId,
  card,
  onOpenPlans,
}: {
  deviceId: string;
  card: QueryCardContext;
  onOpenPlans: () => void;
}) {
  const { t } = useI18n();
  const [history, setHistory] = useState<BalanceQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [querying, setQuerying] = useState(false);
  const requestId = useRef(0);

  const reload = useCallback(
    async (silent = false) => {
      const id = ++requestId.current;
      if (!silent) setLoading(true);
      try {
        const list = await api<BalanceQuery[]>(cardBalanceQueriesPath(card));
        if (id !== requestId.current) return;
        setHistory(Array.isArray(list) ? list : []);
        setLoadError(null);
      } catch (error) {
        if (id !== requestId.current) return;
        setLoadError(apiMessage(error));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [card],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const poll = useCallback(() => {
    if (!querying) void reload(true);
  }, [querying, reload]);
  usePolling(poll, 10000, false);

  const current = history.find((item) => item.state === "completed" && item.parseState === "parsed");
  const changeTag = balanceChangeTag(current);

  async function startQuery() {
    if (querying) return;
    setQuerying(true);
    try {
      await api("/query-center/balance-queries", {
        method: "POST",
        body: { deviceId, iccid: card.iccid, profileAid: card.profileAid },
      });
      message.success(t("查询已提交"));
      window.setTimeout(() => void reload(true), 600);
    } catch (error) {
      // 离线、缺规则、查询进行中、切卡失败等错误码由后端透出，直接展示。
      message.error(tl("查询失败：") + apiMessage(error));
    } finally {
      setQuerying(false);
    }
  }

  return (
    <div className="min-h-[320px] space-y-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t("当前余额")}</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
            {current ? `${current.amount} ${current.currency || ""}` : t("暂无解析结果")}
          </div>
          {current && changeTag !== "unknown" ? (
            <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              {changeTag === "increase" ? (
                <ArrowTrendingRegular className="h-3.5 w-3.5 text-green-500" />
              ) : changeTag === "decrease" ? (
                <ArrowTrendingDownRegular className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <SubtractRegular className="h-3.5 w-3.5" />
              )}
              <span>
                {changeTag === "unchanged"
                  ? t("余额无变化")
                  : tf("较上次{direction} {change}", {
                      direction: changeTag === "increase" ? t("增加") : t("减少"),
                      change: current.changeAmount || "",
                    })}
              </span>
            </div>
          ) : null}
        </div>
        <Button variant="primary" loading={querying} disabled={querying} onClick={() => void startQuery()}>
          {querying ? t("查询中…") : t("立即查询")}
        </Button>
      </div>

      {loadError ? (
        <ErrorState title={t("余额历史加载失败")} message={loadError} retryText={t("重试")} onRetry={() => void reload()} />
      ) : null}

      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t("余额历史")}</div>
        <Button size="small" variant="text" onClick={onOpenPlans}>
          {t("配置自动查询计划 →")}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-6">
          <Spinner className="h-6 w-6 text-[#0ea5e9]" />
        </div>
      ) : history.length === 0 && !loadError ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400 dark:border-gray-700">
          {t("还没有查询记录，点击「立即查询」发起一次余额查询")}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-white/5">
          {history.slice(0, HISTORY_LIMIT).map((item) => {
            const tag = stateTag(item.state);
            return (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Tag type={tag.type}>{t(tag.text)}</Tag>
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                      {item.amount ? `${item.amount} ${item.currency || ""}` : item.summary || item.error || "—"}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-gray-400">
                    {formatTime(item.completedAt || item.startedAt)}
                    {item.previousAmount
                      ? ` · ${t("前次")} ${item.previousAmount}`
                      : ""}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
    );
}

