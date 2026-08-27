import { cx } from "../../lib/utils";

export interface AtLogItem {
  ts: number;
  cmd: string;
  ok: boolean;
  response: string;
}

export function AtLogEntry({ item }: { item: AtLogItem }) {
  const time = new Date(item.ts).toLocaleTimeString();
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-500 px-4 py-2.5 text-white shadow-sm">
          <div className="break-words font-mono text-sm">{item.cmd}</div>
          <div className="mt-1 text-right text-[10px] text-indigo-100">{time}</div>
        </div>
      </div>
      <div className="flex w-full justify-start">
        <div
          className={cx(
            "max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm",
            item.ok
              ? "border border-gray-100 bg-white text-gray-800 dark:border-white/5 dark:bg-gray-800 dark:text-gray-200"
              : "border border-red-100 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/30 dark:text-red-300",
          )}
        >
          <div className="whitespace-pre-wrap break-words font-mono text-sm">{item.response}</div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
            <span>{time}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AtTypingBubble({ label }: { label: string }) {
  return (
    <div className="mt-2 flex w-full justify-start">
      <div className="flex max-w-[80%] items-center gap-2 rounded-2xl rounded-tl-sm border border-gray-100 bg-white px-4 py-3 shadow-sm dark:border-white/5 dark:bg-gray-800">
        <div className="flex space-x-1">
          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.3s]" />
          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.15s]" />
          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" />
        </div>
        <span className="ml-1 text-xs text-gray-400">{label}</span>
      </div>
    </div>
  );
}
