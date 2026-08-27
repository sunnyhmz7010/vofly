import { cx } from "../../lib/utils";

export interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  size?: "default" | "small";
  ariaLabel?: string;
}

// el-switch equivalent toggle.
export function Switch({ checked, onChange, disabled, loading, size = "default", ariaLabel }: SwitchProps) {
  const small = size === "small";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled || loading}
      onClick={() => onChange?.(!checked)}
      className={cx(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 outline-none",
        "focus-visible:ring-2 focus-visible:ring-[#0ea5e9]/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950",
        "disabled:cursor-not-allowed disabled:opacity-50",
        small ? "h-4 w-8" : "h-5 w-10",
        checked ? "bg-[#0ea5e9]" : "bg-gray-300 dark:bg-white/20",
      )}
    >
      <span
        className={cx(
          "inline-block transform rounded-full bg-white shadow transition-transform duration-200",
          small ? "h-3 w-3" : "h-4 w-4",
          checked ? (small ? "translate-x-[18px]" : "translate-x-[22px]") : "translate-x-[2px]",
        )}
      />
    </button>
  );
}
