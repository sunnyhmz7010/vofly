export type AutomaticTaskType =
  | "sms"
  | "call"
  | "public_ip"
  | "cellular_attach"
  | "balance_query"
  | "renewal_reminder";
export type AutomaticTaskEnvironment = "vowifi" | "cellular" | "none";

// 固定使用基站直连的任务类型：执行时需要蜂窝无线电驻网。
const CELLULAR_ONLY_TASK_TYPES: ReadonlySet<AutomaticTaskType> = new Set([
  "public_ip",
  "cellular_attach",
]);

// 不涉及无线电环境的任务类型：记录层面固定为 none。
// 余额查询执行时仍会在内部按蜂窝准备（发 USSD/短信需要驻网），
// 但任务本身不声明执行环境；续费提醒完全不碰无线电。
const ENVIRONMENT_FREE_TASK_TYPES: ReadonlySet<AutomaticTaskType> = new Set([
  "balance_query",
  "renewal_reminder",
]);

export function normalizeAutomaticTaskEnvironment(
  taskType: AutomaticTaskType,
  environment: AutomaticTaskEnvironment,
): AutomaticTaskEnvironment {
  if (ENVIRONMENT_FREE_TASK_TYPES.has(taskType)) return "none";
  if (CELLULAR_ONLY_TASK_TYPES.has(taskType)) return "cellular";
  return environment;
}

export function automaticTaskNeedsPhone(taskType: AutomaticTaskType) {
  return taskType === "sms" || taskType === "call";
}
