export type AutomaticTaskType =
  | "sms"
  | "call"
  | "public_ip"
  | "cellular_attach"
  | "balance_query"
  | "renewal_reminder";
export type AutomaticTaskEnvironment = "vowifi" | "cellular";

// 固定使用基站直连的任务类型：余额类任务需要蜂窝无线电，不允许 VoWiFi。
const CELLULAR_ONLY_TASK_TYPES: ReadonlySet<AutomaticTaskType> = new Set([
  "public_ip",
  "cellular_attach",
  "balance_query",
  "renewal_reminder",
]);

export function normalizeAutomaticTaskEnvironment(
  taskType: AutomaticTaskType,
  environment: AutomaticTaskEnvironment,
): AutomaticTaskEnvironment {
  return CELLULAR_ONLY_TASK_TYPES.has(taskType) ? "cellular" : environment;
}

export function automaticTaskNeedsPhone(taskType: AutomaticTaskType) {
  return taskType === "sms" || taskType === "call";
}
