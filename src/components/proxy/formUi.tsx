import type { ReactNode } from "react";
import { Switch } from "../ui";

export function SectionHeader({ tone, title }: { tone: "indigo" | "amber" | "green"; title: string }) {
  const bar = tone === "amber" ? "bg-amber-500" : tone === "green" ? "bg-green-500" : "bg-indigo-500";
  return (
    <div className="flex items-center gap-2 border-b border-gray-100 pb-2 dark:border-gray-800">
      <div className={`h-4 w-1 rounded-full ${bar}`} />
      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</h3>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</label>
      {children}
    </div>
  );
}

export function ToggleRow({
  title,
  checked,
  onChange,
}: {
  title: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="ui-panel-muted flex items-center justify-between rounded-lg p-3">
      <div>
        <div className="text-sm font-bold text-gray-800 dark:text-gray-100">{title}</div>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}
