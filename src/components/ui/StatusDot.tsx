import { cx } from "../../lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "neutral";

const TONE: Record<StatusTone, string> = {
  success: "bg-green-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-gray-400",
};

// StatusLight: colored pulsing status dot.
export function StatusDot({
  tone = "neutral",
  size = "sm",
  animated = true,
  className,
}: {
  tone?: StatusTone;
  size?: "sm" | "md";
  animated?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block flex-shrink-0 rounded-full",
        TONE[tone],
        size === "md" ? "h-1.5 w-1.5" : "h-2 w-2",
        animated && "animate-pulse",
        className,
      )}
    />
  );
}
