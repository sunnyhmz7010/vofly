import { useEffect, type ReactNode } from "react";
import { cx } from "../../lib/utils";

// el-drawer equivalent (slides in from the left) used for the mobile sidebar.
export function Drawer({
  open,
  onClose,
  children,
  widthClass = "w-64",
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2900]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cx(
          "absolute inset-y-0 left-0 overflow-hidden shadow-2xl animate-[drawer-in_0.25s_cubic-bezier(0.4,0,0.2,1)]",
          widthClass,
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
