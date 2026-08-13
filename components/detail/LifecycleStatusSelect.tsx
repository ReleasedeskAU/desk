/**
 * Status dropdown that shows why disabled next steps can’t be chosen on hover.
 * Native &lt;select&gt; options cannot host reliable tooltips — this listbox can.
 */
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { HoverExplain } from "@/components/ui/InfoTooltip";
import { taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

export type LifecycleStatusSelectOption = {
  value: string;
  /** Visible row label (may include “· blocked”). */
  label: string;
  disabled?: boolean;
  /** Hover / tap explanation for disabled or soft-gated options. */
  hint?: string;
};

type LifecycleStatusSelectProps = {
  value: string;
  options: LifecycleStatusSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** Accessible name for the control. */
  "aria-label"?: string;
};

/**
 * Custom status select with hover reasons on disabled options.
 *
 * @param props - Value, options (with optional hints), and change handler
 * @returns Listbox-styled status control
 */
export function LifecycleStatusSelect({
  value,
  options,
  onChange,
  disabled = false,
  className,
  "aria-label": ariaLabel = "Status",
}: LifecycleStatusSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const display = selected?.label ?? value;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          taInput,
          "flex w-full items-center justify-between gap-2 text-left"
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 truncate">{display || "Select status…"}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-[80] mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-[var(--border)] dark:bg-[var(--card)]"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            const row = (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled || undefined}
                disabled={Boolean(opt.disabled)}
                title={
                  // Fallback when HoverExplain isn’t used (enabled + soft hint).
                  !opt.disabled && opt.hint ? opt.hint : undefined
                }
                className={cn(
                  "flex w-full px-3 py-2 text-left text-sm",
                  opt.disabled
                    ? "cursor-not-allowed text-slate-400 dark:text-white/35"
                    : "text-slate-800 hover:bg-slate-50 dark:text-white dark:hover:bg-white/10",
                  isSelected &&
                    !opt.disabled &&
                    "bg-violet-50 font-medium text-violet-900 dark:bg-violet-500/15 dark:text-violet-100"
                )}
                onClick={() => {
                  if (opt.disabled) return;
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 whitespace-normal">{opt.label}</span>
              </button>
            );

            // HoverExplain intercepts clicks — only wrap disabled rows.
            if (opt.disabled && opt.hint) {
              return (
                <li key={opt.value} role="presentation">
                  <HoverExplain
                    text={opt.hint}
                    label={`Why ${opt.value} is unavailable`}
                    className="block w-full rounded-none"
                    placement="bottom"
                  >
                    <div className="pointer-events-none">{row}</div>
                  </HoverExplain>
                </li>
              );
            }

            return (
              <li key={opt.value} role="presentation">
                {row}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
