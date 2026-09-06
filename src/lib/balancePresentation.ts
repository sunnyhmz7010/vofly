// 余额记录展示的纯逻辑：变化方向标签与查询状态标签。供自动任务页的
// 余额变动历史框使用；缺失或未知值一律归为 unknown，不伪造变化值。
import type { BalanceQuery } from "../types";

export type BalanceChangeTag = "increase" | "decrease" | "unchanged" | "unknown";

export type BalanceStateTagType = "success" | "danger" | "warning" | "info";

export interface BalanceStateTag {
  text: string;
  type: BalanceStateTagType;
}

function trim(value: string | undefined | null): string {
  return String(value ?? "").trim();
}

// balanceChangeTag 把余额记录的变化方向映射为展示标签。
export function balanceChangeTag(query: Pick<BalanceQuery, "changeDirection"> | undefined): BalanceChangeTag {
  const direction = trim(query?.changeDirection);
  if (direction === "increase" || direction === "decrease" || direction === "unchanged") {
    return direction;
  }
  return "unknown";
}

// balanceStateTag 把查询状态映射为中文标签与 Tag 类型（中文为键，英文经
// i18n 字典解析）。
export function balanceStateTag(state: BalanceQuery["state"]): BalanceStateTag {
  switch (state) {
    case "completed":
      return { text: "已完成", type: "success" };
    case "failed":
      return { text: "失败", type: "danger" };
    case "timed_out":
      return { text: "已超时", type: "warning" };
    case "awaiting_reply":
      return { text: "等待回复", type: "warning" };
    default:
      return { text: "发送中", type: "info" };
  }
}

// balanceChangeText 生成变化方向的展示文案；未知方向返回空串。
export function balanceChangeText(query: Pick<BalanceQuery, "changeDirection" | "changeAmount">, t: (key: string) => string): string {
  const tag = balanceChangeTag(query);
  const amount = trim(query.changeAmount);
  switch (tag) {
    case "increase":
      return t("较上次增加") + (amount ? ` ${amount}` : "");
    case "decrease":
      return t("较上次减少") + (amount ? ` ${amount}` : "");
    case "unchanged":
      return t("余额无变化");
    default:
      return "";
  }
}
