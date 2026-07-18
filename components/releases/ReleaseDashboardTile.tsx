"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionTone } from "@/components/detail/editable";

const ACCENT_BORDER: Record<SectionTone, string> = {
  indigo: "border-l-indigo-500",
  rose: "border-l-rose-500",
  emerald: "border-l-emerald-500",
  sky: "border-l-sky-500",
  violet: "border-l-violet-500",
  amber: "border-l-amber-500",
};

const ICON_TONE: Record<SectionTone, string> = {
  indigo: "bg-indigo-50 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300",
  rose: "bg-rose-50 text-rose-500 dark:bg-rose-500/15 dark:text-rose-300",
  emerald: "bg-emerald-50 text-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300",
  sky: "bg-sky-50 text-sky-500 dark:bg-sky-500/15 dark:text-sky-300",
  violet: "bg-violet-50 text-violet-500 dark:bg-violet-500/15 dark:text-violet-300",
  amber: "bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-300",
};

const HERO_TONE: Record<SectionTone, string> = {
  indigo: "text-indigo-600 dark:text-indigo-300",
  rose: "text-rose-600 dark:text-rose-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  sky: "text-sky-600 dark:text-sky-300",
  violet: "text-violet-600 dark:text-violet-300",
  amber: "text-amber-600 dark:text-amber-400",
};

export type TileMetric = {
  label: string;
  value: string;
};

export type ReleaseDashboardTileProps = {
  icon: LucideIcon;
  title: string;
  tone?: SectionTone;
  /** Large KPI on the tile face. */
  hero: { value: string; label: string };
  /** Secondary scannable signals (2–4). */
  metrics: TileMetric[];
  /** Section id to scroll to (without #). */
  href: string;
  className?: string;
};

/**
 * Stat tile for the release command center. Click jumps to an always-open
 * detail section further down the page (not an accordion).
 *
 * @param props - Tile chrome, KPI metrics, and deep-dive anchor.
 * @returns Anchor-styled dashboard tile.
 */
export function ReleaseDashboardTile({
  icon: Icon,
  title,
  tone = "indigo",
  hero,
  metrics,
  href,
  className,
}: ReleaseDashboardTileProps) {
  const target = href.startsWith("#") ? href : `#${href}`;

  return (
    <a
      href={target}
      className={cn(
        "flex h-full flex-col rounded-[22px] border border-slate-100/80 border-l-[4px] bg-white px-5 py-4 shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-20px_rgba(112,144,176,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-[var(--border)] dark:bg-[var(--card)] dark:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.55)]",
        ACCENT_BORDER[tone],
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              ICON_TONE[tone]
            )}
          >
            <Icon size={16} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/45">
              {title}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-white/40">Jump to section</p>
          </div>
        </div>
        <ArrowDownRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 dark:text-white/45" aria-hidden />
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p
            className={cn(
              "text-[2rem] font-extrabold leading-none tracking-tight tabular-nums",
              HERO_TONE[tone]
            )}
          >
            {hero.value}
          </p>
          <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-white/55">{hero.label}</p>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2 text-right sm:max-w-[220px]">
          {metrics.slice(0, 4).map((metric) => (
            <div key={metric.label} className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
                {metric.label}
              </p>
              <p className="truncate text-[12.5px] font-bold text-slate-700 dark:text-white/80">
                {metric.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </a>
  );
}
