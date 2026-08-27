import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDownRegular, CheckmarkRegular } from "@fluentui/react-icons";
import { cx } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  value?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  size?: "default" | "large";
  className?: string;
}

// el-select equivalent (single-select dropdown).
// The menu is portaled to document.body and positioned with `position: fixed` so
// it escapes any ancestor stacking/clipping context (e.g. a `.ui-card`'s
// backdrop-filter) that would otherwise let content below paint over the menu.
const MENU_MAX_HEIGHT = 240; // max-h-60

export function Select({ value, onChange, options, placeholder, disabled, size = "default", className }: SelectProps) {
  const { t } = useI18n();
  const ph = placeholder ?? t("请选择");
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on pointer-down outside both the trigger and the portaled menu.
  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Close on page scroll/resize so the fixed menu never detaches from its trigger —
  // but ignore scrolls that originate inside the menu itself (mouse-wheeling the
  // option list should scroll the list, not dismiss it).
  useEffect(() => {
    if (!open) return;
    function onScroll(event: Event) {
      const target = event.target as Node | null;
      if (target && (rootRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      setOpen(false);
    }
    const close = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggleOpen() {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    const el = rootRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < MENU_MAX_HEIGHT + 8 && rect.top > spaceBelow;
      setMenuStyle({
        position: "fixed",
        left: rect.left,
        width: rect.width,
        zIndex: 3100,
        maxHeight: MENU_MAX_HEIGHT,
        ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    }
    setOpen(true);
  }

  const selected = options.find((option) => option.value === value);

  return (
    <div ref={rootRef} className={cx("relative w-full", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className={cx(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-[#dcdfe6] bg-white px-3 text-left text-sm text-gray-900 outline-none transition-all",
          "hover:border-[#c0c4cc] focus:border-[#0ea5e9] focus:ring-2 focus:ring-[#0ea5e9]/25",
          "dark:border-white/15 dark:bg-black/20 dark:text-gray-100 dark:hover:border-white/25",
          "disabled:cursor-not-allowed disabled:opacity-60",
          size === "large" ? "h-10" : "h-8",
        )}
      >
        <span className={cx("truncate", !selected && "text-gray-400 dark:text-gray-500")}>
          {selected ? selected.label : ph}
        </span>
        <ChevronDownRegular className={cx("shrink-0 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className="overflow-auto rounded-lg border border-gray-200/70 bg-white p-1 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#1c1c22]"
          >
          {options.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">{t("暂无数据")}</div>}
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  onChange?.(option.value);
                  setOpen(false);
                }}
                className={cx(
                  "flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                  active
                    ? "font-semibold text-[#0ea5e9] dark:text-[#7dd3fc]"
                    : "text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10",
                  option.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="truncate">{option.label}</span>
                {active && <CheckmarkRegular className="shrink-0" />}
              </button>
            );
          })}
          </div>,
          document.body,
        )}
    </div>
  );
}
