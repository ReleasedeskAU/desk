"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type HeroTone = "rose" | "amber" | "emerald" | "indigo" | "sky" | "violet";

const GRADIENT: Record<HeroTone, string> = {
  rose: "from-rose-500 to-rose-600 shadow-rose-200/80 dark:shadow-rose-900/40",
  amber: "from-amber-500 to-amber-600 shadow-amber-200/80 dark:shadow-amber-900/40",
  emerald: "from-emerald-500 to-emerald-600 shadow-emerald-200/80 dark:shadow-emerald-900/40",
  indigo: "from-indigo-500 to-indigo-600 shadow-indigo-200/80 dark:shadow-indigo-900/40",
  sky: "from-sky-500 to-sky-600 shadow-sky-200/80 dark:shadow-sky-900/40",
  violet: "from-violet-500 to-violet-600 shadow-violet-200/80 dark:shadow-violet-900/40",
};

const RING: Record<HeroTone, string> = {
  rose: "#f43f5e",
  amber: "#f59e0b",
  emerald: "#10b981",
  indigo: "#6366f1",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
};

type HeroStatusRowProps = {
  /** Gradient hero — most critical status on the page. */
  hero: {
    icon: LucideIcon;
    label: string;
    value: ReactNode;
    tone?: HeroTone;
  };
  /** Secondary white status card. */
  secondary: {
    icon: LucideIcon;
    label: string;
    value: ReactNode;
  };
  /** Progress ring card (0–100). */
  metric: {
    icon: LucideIcon;
    label: string;
    percent: number;
    caption: string;
    tone?: HeroTone;
  };
};

/**
 * Top-of-page glance row: gradient hero + status card + progress ring.
 */
export function HeroStatusRow({ hero, secondary, metric }: HeroStatusRowProps) {
  const HeroIcon = hero.icon;
  const SecondaryIcon = secondary.icon;
  const MetricIcon = metric.icon;
  const heroTone = hero.tone ?? "rose";
  const ringTone = metric.tone ?? "amber";
  const pct = Math.max(0, Math.min(100, metric.percent));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div
        className={cn(
          "rounded-[22px] bg-gradient-to-br p-5 text-white shadow-lg",
          GRADIENT[heroTone]
        )}
      >
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-white/80">
          <HeroIcon size={13} aria-hidden />
          {hero.label}
        </div>
        <div className="mt-2 text-[24px] font-bold leading-tight">{hero.value}</div>
      </div>

      <div className="rounded-[22px] bg-white p-5 shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] dark:bg-[var(--card)] dark:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.55)]">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-white/45">
          <SecondaryIcon size={13} aria-hidden />
          {secondary.label}
        </div>
        <div className="mt-2 text-[24px] font-bold text-slate-800 dark:text-white">{secondary.value}</div>
      </div>

      <div className="rounded-[22px] bg-white p-5 shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] dark:bg-[var(--card)] dark:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.55)]">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-white/45">
          <MetricIcon size={13} aria-hidden />
          {metric.label}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0">
            <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90" aria-hidden>
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-200 dark:text-white/15" />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke={RING[ringTone]}
                strokeWidth="4"
                strokeDasharray={`${pct} 100`}
                strokeLinecap="round"
                className="transition-all duration-300 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-slate-700 dark:text-white">
              {Math.round(pct)}%
            </div>
          </div>
          <span className="text-[12px] text-slate-400 dark:text-white/50">{metric.caption}</span>
        </div>
      </div>
    </div>
  );
}
