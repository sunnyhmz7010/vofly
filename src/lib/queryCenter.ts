// 查询中心前端数据契约的纯逻辑：卡键、有效资源合并、余额变化标签、计划
// 类型标签与统一 URL 构造。禁止在组件里手拼 query string，统一走这里的
// 构造器，保证 iccid 与可选 profile_aid 的编码规则一致。
import type { BalancePlan, BalanceQuery, CardResource } from "../types";

export interface CardRef {
  iccid: string;
  profileAid?: string;
}

function trim(value: string | undefined | null): string {
  return String(value ?? "").trim();
}

// cardKey 生成卡上下文的稳定键：实体 SIM 只有 ICCID，eSIM Profile 用
// ICCID + AID 区分同一 ICCID 在不同 eUICC 上的上下文。
export function cardKey(card: CardRef): string {
  const iccid = trim(card.iccid);
  const profileAid = trim(card.profileAid);
  return profileAid ? `${iccid}@${profileAid}` : iccid;
}

// isEsimCard 判断卡上下文是否为 eSIM Profile。
export function isEsimCard(card: CardRef): boolean {
  return trim(card.profileAid) !== "";
}

// effectiveCardResource 计算有效卡资源：存在自定义数据时整体替换默认值，
// 否则（含恢复默认后的空自定义）返回系统默认。
export function effectiveCardResource(
  custom: CardResource | null | undefined,
  defaults: CardResource,
  customized = Boolean(custom),
): CardResource {
  if (!customized || !custom) return defaults;
  return {
    rechargeUrl: trim(custom.rechargeUrl) || "",
    renewUrl: trim(custom.renewUrl) || "",
    knowledgeLinks: Array.isArray(custom.knowledgeLinks) ? custom.knowledgeLinks : [],
  };
}

export type BalanceChangeTag = "increase" | "decrease" | "unchanged" | "unknown";

// balanceChangeTag 把余额记录的变化方向映射为展示标签；缺失或未知方向
// 统一归为 unknown，不伪造变化值。
export function balanceChangeTag(query: Pick<BalanceQuery, "changeDirection"> | undefined): BalanceChangeTag {
  const direction = trim(query?.changeDirection);
  if (direction === "increase" || direction === "decrease" || direction === "unchanged") {
    return direction;
  }
  return "unknown";
}

// planKindLabel 返回计划类型的展示文案（中文为键，英文经 i18n 字典解析）。
export function planKindLabel(kind: BalancePlan["kind"]): string {
  switch (kind) {
    case "balance_query":
      return "余额自动查询";
    case "renewal_reminder":
      return "续费提醒";
    default:
      return "未知计划";
  }
}

function appendQuery(base: string, params: string): string {
  return params ? `${base}?${params}` : base;
}

// cardQueryString 构造 "iccid=..&profile_aid=.." 查询串；实体 SIM 不携带
// profile_aid。
export function cardQueryString(card: CardRef): string {
  const params = new URLSearchParams();
  params.set("iccid", trim(card.iccid));
  const profileAid = trim(card.profileAid);
  if (profileAid) params.set("profile_aid", profileAid);
  return params.toString();
}

// cardResourcePath 构造卡资源接口路径：/query-center/cards/:iccid，可选
// profile_aid 查询参数与 /defaults 后缀。
export function cardResourcePath(card: CardRef, action?: "defaults"): string {
  const iccid = encodeURIComponent(trim(card.iccid));
  const profileAid = trim(card.profileAid);
  const suffix = action ? `/${action}` : "";
  return appendQuery(`/query-center/cards/${iccid}${suffix}`, profileAid ? `profile_aid=${encodeURIComponent(profileAid)}` : "");
}

// cardBalanceQueriesPath 构造余额历史列表路径。
export function cardBalanceQueriesPath(card: CardRef): string {
  return appendQuery("/query-center/balance-queries", cardQueryString(card));
}

// cardBalancePlansPath 构造卡级计划列表路径。
export function cardBalancePlansPath(card: CardRef): string {
  return appendQuery("/query-center/balance-plans", cardQueryString(card));
}

// balancePlanPath 构造单条计划的更新/删除路径。
export function balancePlanPath(id: number): string {
  return `/query-center/balance-plans/${encodeURIComponent(String(id))}`;
}

// balancePlanRunPath 构造计划立即执行路径。
export function balancePlanRunPath(id: number): string {
  return `${balancePlanPath(id)}/run`;
}
