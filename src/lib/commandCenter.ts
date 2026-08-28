export const COMMAND_EVENT_PAGE_SIZE = 100;
export const PASSIVE_COMMAND_EVENT_LIMIT = 300;

export type CommandEventLike = {
  id: number;
};

export function mergeCommandEvents<T extends CommandEventLike>(...lists: readonly T[][]): T[] {
  const merged = new Map<number, T>();
  for (const list of lists) {
    for (const event of list) merged.set(event.id, event);
  }
  return [...merged.values()].sort((left, right) => left.id - right.id);
}

export function retainLatestCommandEvents<T extends CommandEventLike>(events: T[], limit: number) {
  if (events.length <= limit) return { events, dropped: false };
  return { events: events.slice(events.length - limit), dropped: true };
}

export type DangerousCommandInput = {
  name: string;
  device: string;
  target?: string;
  phone?: string;
  duration?: number;
};

function requiredSingleToken(value: string | undefined, message: string) {
  const trimmed = value?.trim() || "";
  if (!trimmed) throw new Error(message);
  if (/\s/.test(trimmed)) throw new Error(`${message}，且不能包含空格`);
  return trimmed;
}

export function buildDangerousCommand(input: DangerousCommandInput) {
  const device = requiredSingleToken(input.device, "请选择设备");
  if (input.name === "rotate") return `/rotate ${device}`;
  if (input.name === "switch") {
    const target = requiredSingleToken(input.target, "请填写 Profile 序号或 ICCID");
    return `/switch ${device} ${target}`;
  }
  if (input.name === "vocall" || input.name === "cellcall") {
    const phone = requiredSingleToken(input.phone, "请填写电话号码");
    const duration = Math.max(1, Math.min(600, Math.floor(Number(input.duration) || 15)));
    return `/${input.name} ${device} ${phone} ${duration}`;
  }
  throw new Error(`不支持的快捷动作 /${input.name}`);
}
