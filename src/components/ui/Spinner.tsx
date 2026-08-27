import { cx } from "../../lib/utils";

// Circular spinner matching the login / loading indicators (border spinner).
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      aria-hidden="true"
    />
  );
}
