"use client";

/**
 * Compact labeled switch for Release Lifecycle settings (On/Off, Required, etc.).
 */
import { cn } from "@/lib/utils";

export type LifecycleToggleProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Short label shown beside the switch — e.g. "On" / "Off" or "Required". */
  label: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
  "data-testid"?: string;
};

/**
 * Accessible switch control matching Risk Engine settings styling.
 */
export function LifecycleToggle({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  title,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: LifecycleToggleProps) {
  return (
    <div
      className="flex items-center gap-2"
      title={title}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        data-testid={testId}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-600"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
      <span
        className={cn(
          "min-w-[2.25rem] text-[12px] font-semibold",
          checked
            ? "text-slate-800 dark:text-white/90"
            : "text-slate-500 dark:text-white/50"
        )}
      >
        {label}
      </span>
    </div>
  );
}
