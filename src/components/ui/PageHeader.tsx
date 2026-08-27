import type { ReactNode } from "react";

// PageHeader with gradient title + optional subtitle + right-aligned actions.
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-3xl font-bold text-transparent dark:from-white dark:to-gray-400">
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}
