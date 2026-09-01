export interface CardContextKeyInput {
  deviceId: string;
  iccid: string;
  profileAid?: string;
}

export interface CardContext extends CardContextKeyInput {
  deviceName: string;
  profileName?: string;
  carrierName?: string;
  kind: "physical" | "profile";
}

function encode(value: string) {
  return encodeURIComponent(value.trim());
}

export function buildCardContextKey(card: CardContextKeyInput) {
  return `${card.deviceId.trim()}:${card.iccid.trim()}:${(card.profileAid || "").trim()}`;
}

export function queryCenterCardResourcePath(iccid: string, profileAid?: string) {
  const params = new URLSearchParams();
  if ((profileAid || "").trim()) params.set("profile_aid", (profileAid || "").trim());
  const query = params.toString();
  return `/query-center/cards/${encode(iccid)}${query ? `?${query}` : ""}`;
}

export function queryCenterBalanceQueriesPath(iccid: string, profileAid?: string) {
  const params = new URLSearchParams({ iccid: iccid.trim() });
  if ((profileAid || "").trim()) params.set("profile_aid", (profileAid || "").trim());
  return `/query-center/balance-queries?${params.toString()}`;
}

export function queryCenterBalancePlansPath(iccid: string, profileAid?: string) {
  const params = new URLSearchParams({ iccid: iccid.trim() });
  if ((profileAid || "").trim()) params.set("profile_aid", (profileAid || "").trim());
  return `/query-center/balance-plans?${params.toString()}`;
}

export function formatCardContextTitle(card?: CardContext | null) {
  if (!card) return "未选择卡或 Profile";
  return card.profileName?.trim() || card.carrierName?.trim() || (card.kind === "physical" ? "实体 SIM" : "eSIM Profile");
}

export function planKindLabel(kind: string) {
  switch (kind) {
    case "balance_query":
      return "余额查询";
    case "renewal_reminder":
      return "充值续费";
    default:
      return kind || "计划";
  }
}
