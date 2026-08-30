export type AutomaticTaskType = "sms" | "call" | "public_ip" | "cellular_attach";
export type AutomaticTaskEnvironment = "vowifi" | "cellular";

export function normalizeAutomaticTaskEnvironment(
  taskType: AutomaticTaskType,
  environment: AutomaticTaskEnvironment,
): AutomaticTaskEnvironment {
  return taskType === "public_ip" || taskType === "cellular_attach" ? "cellular" : environment;
}

export function automaticTaskNeedsPhone(taskType: AutomaticTaskType) {
  return taskType === "sms" || taskType === "call";
}
