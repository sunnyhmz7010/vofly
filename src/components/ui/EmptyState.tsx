import type { ReactNode } from "react";

// EmptyState: dashed muted panel with icon, title, and actions.
export function EmptyState({
  title,
  icon,
  actions,
}: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="ui-surface-muted rounded-2xl border border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100/80 text-gray-500 dark:bg-white/5 dark:text-gray-300">
        {icon ?? <span className="text-xl font-bold">∅</span>}
      </div>
      <div className="mt-4 text-sm font-bold text-gray-700 dark:text-gray-200">{title}</div>
      <div className="mt-5 flex items-center justify-center gap-2">{actions}</div>
    </div>
  );
}
