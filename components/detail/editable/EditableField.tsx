"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Clock, Lock } from "lucide-react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { cn } from "@/lib/utils";

type LockedIdFieldProps = {
  label: string;
  value: string;
  lockReason?: string;
};

/**
 * Primary ID — always non-editable, with lock icon + tooltip explaining why.
 */
export function LockedIdField({
  label,
  value,
  lockReason = "Permanent ID — can't be changed",
}: LockedIdFieldProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
        {label}
        <InfoTooltip text={lockReason} label={`${label} is locked`}>
          <Lock className="h-3 w-3 text-slate-300 dark:text-white/35" strokeWidth={2} aria-hidden />
        </InfoTooltip>
      </div>
      <div
        className="mt-1 cursor-not-allowed rounded-lg px-0.5 py-1 font-mono text-[13.5px] font-semibold text-slate-400 dark:text-white/40"
        aria-readonly="true"
      >
        {value}
      </div>
    </div>
  );
}

export type EditableFieldKind = "text" | "textarea" | "select" | "date" | "number";

type EditableFieldProps = {
  label: string;
  value: string;
  editing: boolean;
  onChange?: (next: string) => void;
  kind?: EditableFieldKind;
  options?: { value: string; label: string }[];
  display?: ReactNode;
  placeholder?: string;
  className?: string;
  mono?: boolean;
  locked?: boolean;
};

const editInputClass =
  "mt-1 w-full rounded-lg border border-indigo-200 bg-indigo-50/40 px-2.5 py-1.5 text-[13px] font-semibold text-slate-800 outline-none transition-all duration-150 focus:border-indigo-400 focus:bg-white focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-white dark:focus:bg-[var(--card)]";

/**
 * View/edit field — bold value in view mode; indigo-tinted input in edit mode.
 */
export function EditableField({
  label,
  value,
  editing,
  onChange,
  kind = "text",
  options = [],
  display,
  placeholder,
  className,
  mono,
  locked,
}: EditableFieldProps) {
  const show = display ?? (value?.trim() ? value : "—");
  const canEdit = editing && onChange && !locked;

  return (
    <div className={cn("transition-all duration-200 ease-out", className)}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
        {label}
        {locked && (
          <InfoTooltip text="Permanent ID — can't be changed" label={`${label} is locked`}>
            <Lock className="h-3 w-3 text-slate-300 dark:text-white/35" strokeWidth={2} aria-hidden />
          </InfoTooltip>
        )}
      </div>
      {canEdit ? (
        kind === "textarea" ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className={cn(editInputClass, "min-h-[80px] resize-y")}
          />
        ) : kind === "select" ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={editInputClass}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={kind === "date" ? "date" : kind === "number" ? "number" : "text"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={cn(editInputClass, mono && "font-mono")}
          />
        )
      ) : (
        <div
          className={cn(
            "mt-1 rounded-lg px-0.5 py-1 text-[13.5px] font-semibold transition-colors duration-150",
            locked ? "cursor-not-allowed text-slate-400 dark:text-white/40" : "text-slate-800 dark:text-white",
            mono && "font-mono"
          )}
        >
          {show}
        </div>
      )}
    </div>
  );
}

type EditableFieldGridProps = {
  cols?: 1 | 2 | 3;
  children: ReactNode;
};

export function EditableFieldGrid({ cols = 2, children }: EditableFieldGridProps) {
  return (
    <div
      className={cn(
        "grid gap-x-6 gap-y-4",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-1 sm:grid-cols-2",
        cols === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      )}
    >
      {children}
    </div>
  );
}

type SignoffChipProps = {
  label: string;
  done: boolean;
};

/** Boolean / done-vs-pending chip with icon (matches reference SignoffChip). */
export function SignoffChip({ label, done }: SignoffChipProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors duration-150",
        done ? "bg-emerald-50 dark:bg-emerald-500/15" : "bg-slate-50 dark:bg-white/5"
      )}
    >
      <span className="text-[12px] font-medium text-slate-600 dark:text-white/70">{label}</span>
      <span
        className={cn(
          "flex items-center gap-1 text-[11px] font-bold",
          done ? "text-emerald-600 dark:text-emerald-300" : "text-slate-400 dark:text-white/40"
        )}
      >
        {done ? <CheckCircle2 size={13} aria-hidden /> : <Clock size={13} aria-hidden />}
        {done ? "Done" : "Pending"}
      </span>
    </div>
  );
}
