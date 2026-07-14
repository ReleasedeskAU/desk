"use client";

import { CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChipTone = "neutral" | "good" | "warn" | "bad" | "info";

const TONE: Record<ChipTone, string> = {
  neutral: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/75",
  good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  bad: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  info: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
};

type StatusChipProps = {
  label: string;
  tone?: ChipTone;
  className?: string;
};

/** Pill chip for status / priority / category. */
export function StatusChip({ label, tone = "neutral", className }: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full px-3 py-1 text-[11px] font-bold transition-colors duration-150",
        TONE[tone],
        className
      )}
    >
      {label}
    </span>
  );
}

type ScoreBarProps = {
  value: number;
  max?: number;
  label?: string;
  className?: string;
  /** When true, treat value as already 0–100 percent. */
  asPercent?: boolean;
};

/** Compact progress bar for scores / checklist %. */
export function ScoreBar({ value, max = 10, label, className, asPercent }: ScoreBarProps) {
  const pct = asPercent
    ? Math.max(0, Math.min(100, value))
    : Math.max(0, Math.min(100, (value / max) * 100));
  const tone = pct <= 30 ? "good" : pct <= 60 ? "warn" : "bad";
  // For readiness-style higher-is-better metrics, invert tone when asPercent
  const fillTone = asPercent
    ? pct >= 80
      ? "bg-emerald-500"
      : pct >= 50
        ? "bg-amber-500"
        : "bg-rose-500"
    : {
        good: "bg-emerald-500",
        warn: "bg-amber-500",
        bad: "bg-rose-500",
      }[tone];

  return (
    <div className={cn("min-w-[120px]", className)}>
      {(label != null || !asPercent) && (
        <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
          <span className="font-medium text-slate-600 dark:text-white/70">{label}</span>
          <span className="font-bold text-slate-800 dark:text-white">
            {asPercent ? `${Math.round(pct)}%` : `${value}/${max}`}
          </span>
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <div
          className={cn("h-full rounded-full transition-all duration-300 ease-out", fillTone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

type PendingChipProps = {
  label: string;
  pending?: boolean;
};

/** Done/Pending row used for escalation / coverage style flags. */
export function PendingChip({ label, pending = true }: PendingChipProps) {
  const done = !pending;
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-xl px-3 py-2.5",
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
