import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cx } from "../../lib/utils";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  prefix?: ReactNode;
  suffix?: ReactNode;
  inputSize?: "default" | "large";
}

// el-input equivalent with optional prefix/suffix icons.
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { prefix, suffix, inputSize = "default", className, ...rest },
  ref,
) {
  return (
    <div className={cx("relative flex w-full items-center", className)}>
      {prefix && (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 dark:text-gray-500">
          {prefix}
        </span>
      )}
      <input
        ref={ref}
        className={cx(
          "w-full rounded-lg border border-[#dcdfe6] bg-white px-3 text-sm text-gray-900 outline-none transition-all",
          "placeholder:text-gray-400 hover:border-[#c0c4cc] focus:border-[#0ea5e9] focus:ring-2 focus:ring-[#0ea5e9]/25",
          "dark:border-white/15 dark:bg-black/20 dark:text-gray-100 dark:placeholder:text-gray-500 dark:hover:border-white/25 dark:focus:border-[#0ea5e9]",
          inputSize === "large" ? "h-10" : "h-8",
          prefix ? "pl-10" : null,
          suffix ? "pr-10" : null,
        )}
        {...rest}
      />
      {suffix && (
        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 dark:text-gray-500">{suffix}</span>
      )}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx(
        "w-full rounded-lg border border-[#dcdfe6] bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-all",
        "placeholder:text-gray-400 hover:border-[#c0c4cc] focus:border-[#0ea5e9] focus:ring-2 focus:ring-[#0ea5e9]/25",
        "dark:border-white/15 dark:bg-black/20 dark:text-gray-100 dark:placeholder:text-gray-500 dark:hover:border-white/25 dark:focus:border-[#0ea5e9]",
        className,
      )}
      {...rest}
    />
  );
});
