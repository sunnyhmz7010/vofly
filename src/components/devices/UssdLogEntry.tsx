import { cx } from "../../lib/utils";

export interface UssdLogItem {
  ts: number;
  type: "req" | "res" | "err" | "sys";
  content: string;
  dcs?: number;
  channel?: string;
}

export function UssdLogEntry({ item }: { item: UssdLogItem }) {
  const time = new Date(item.ts).toLocaleTimeString();
  if (item.type === "sys") {
    return (
      <div className="w-full text-center">
        <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-400 dark:bg-gray-800">{item.content}</span>
      </div>
    );
  }
  if (item.type === "req") {
    return (
      <div className="flex w-full justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-500 px-4 py-2.5 text-white shadow-sm">
          <div className="break-words text-sm">{item.content}</div>
          <div className="mt-1 text-right text-[10px] text-indigo-100">{time}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex w-full justify-start">
      <div
        className={cx(
          "max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm",
          item.type === "err"
            ? "border border-red-100 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/30 dark:text-red-300"
            : "border border-gray-100 bg-white text-gray-800 dark:border-white/5 dark:bg-gray-800 dark:text-gray-200",
        )}
      >
        <div className="whitespace-pre-wrap break-words font-mono text-sm">{item.content}</div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
          <span>{time}</span>
          {item.dcs !== undefined ? <span className="rounded bg-gray-100 px-1 dark:bg-gray-700">DCS: {item.dcs}</span> : null}
          {item.channel ? (
            <span className="rounded bg-gray-100 px-1 dark:bg-gray-700">{item.channel === "vowifi" ? "VoWiFi" : "CS"}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
