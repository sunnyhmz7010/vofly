import { useI18n } from "../../lib/i18n";
import { cx } from "../../lib/utils";
import type { QueryCardContext } from "../../lib/queryCenter";
import { Spinner } from "../ui";

// CardContextList 是中栏卡上下文列表：eSIM Profile 按 EID 分组展示，
// 实体卡是独立上下文。选择上下文只切换查询中心的当前状态，绝不切卡。
export function CardContextList({
  contexts,
  loading,
  selectedKey,
  onSelect,
}: {
  contexts: QueryCardContext[];
  loading: boolean;
  selectedKey: string;
  onSelect: (card: QueryCardContext) => void;
}) {
  const { t } = useI18n();
  const groups = new Map<string, QueryCardContext[]>();
  for (const context of contexts) {
    const key = context.eid || "physical";
    const bucket = groups.get(key);
    if (bucket) bucket.push(context);
    else groups.set(key, [context]);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className="h-6 w-6 text-[#0ea5e9]" />
      </div>
    );
  }
  if (contexts.length === 0) {
    return <div className="p-6 text-center text-sm text-gray-400">{t("未发现可用卡")}</div>;
  }

  return (
    <div className="space-y-1 overflow-auto p-3">
      {[...groups.entries()].map(([eid, items]) => (
        <div key={eid}>
          {eid !== "physical" ? (
            <div className="px-2 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-gray-400">
              {t("eUICC")} {eid ? `· ${eid.slice(0, 12)}…` : ""}
            </div>
          ) : null}
          {items.map((card) => (
            <button
              key={`${card.iccid}@${card.profileAid}`}
              type="button"
              onClick={() => onSelect(card)}
              className={cx(
                "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-all",
                `${card.iccid}@${card.profileAid}` === selectedKey
                  ? "border-indigo-200 bg-indigo-50/70 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                  : "border-transparent hover:bg-gray-50/60 dark:hover:bg-white/5",
              )}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-gray-800 dark:text-gray-100">
                  {card.label || t("eSIM Profile")}
                </div>
                <div className="truncate text-xs text-gray-400">{card.iccid}</div>
              </div>
              <span
                className={cx(
                  "h-2 w-2 shrink-0 rounded-full",
                  card.active ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600",
                )}
              />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
