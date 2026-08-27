import type { ReactNode } from "react";
import { cx } from "../../lib/utils";

export type TagType = "success" | "danger" | "warning" | "info" | "primary";

const TONE: Record<TagType, string> = {
  success: "bg-green-50 text-green-600 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20",
  danger: "bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
  warning: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  info: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-white/5 dark:text-gray-300 dark:border-white/10",
  primary: "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20",
};

// el-tag equivalent.
export function Tag({ type = "info", children, className }: { type?: TagType; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium",
        TONE[type],
        className,
      )}
    >
      {children}
    </span>
  );
}
