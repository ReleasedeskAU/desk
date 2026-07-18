"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownRight } from "lucide-react";
import { HoverExplain, InfoTooltip } from "@/components/ui/InfoTooltip";
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

const METRIC_TONE: Record<SectionTone, string> = {
  indigo: "bg-indigo-50/70 dark:bg-indigo-500/10",
  rose: "bg-rose-50/70 dark:bg-rose-500/10",
  emerald: "bg-emerald-50/70 dark:bg-emerald-500/10",
  sky: "bg-sky-50/70 dark:bg-sky-500/10",
  violet: "bg-violet-50/70 dark:bg-violet-500/10",
  amber: "bg-amber-50/70 dark:bg-amber-500/10",
};

export type TileMetric = {
  label: string;
  value: string;
  /** Plain-English explanation shown when the user hovers / taps this chip. */
  hint: string;
};

export type ReleaseDashboardTileProps = {
  icon: LucideIcon;
  title: string;
  tone?: SectionTone;
  /** One plain-English line explaining what this tile means — no jargon, no prior context assumed. */
  subtitle: string;
  /** Longer explanation shown in the "?" tooltip — what the numbers mean and how to act on them. */
  detail: string;
  /** Large KPI on the tile face. */
  hero: { value: string; label: string; hint: string };
  /** Secondary scannable signals (shown in a full-width grid). */
  metrics: TileMetric[];
  /** Section id to scroll to (without #). */
  href: string;
  className?: string;
};

/**
 * Dashboard KPI tile. Uses the full card width for hero + metric grid so
 * current release data is readable without truncation. Hover any chip for
 * a plain-English explanation. Click jumps to the matching deep-dive section.
 *
 * @param props - Tile chrome, KPI metrics with hints, and deep-dive anchor.
 * @returns Anchor-styled dashboard tile.
 */
export function ReleaseDashboardTile({
  icon: Icon,
  title,
  tone = "indigo",
  subtitle,
  detail,
  hero,
  metrics,
  href,
  className,
}: ReleaseDashboardTileProps) {
  const target = href.startsWith("#") ? href : `#${href}`;
  const visibleMetrics = metrics.slice(0, 8);

  return (
    <a
      href={target}
      className={cn(
        "flex h-full flex-col rounded-[22px] border border-slate-100/80 border-l-[4px] bg-white px-5 py-4 shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] transition-shadow duration-150 hover:shadow-[0_20px_44px_-20px_rgba(112,144,176,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-[var(--border)] dark:bg-[var(--card)] dark:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.55)]",
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
            <div className="flex items-center gap-1">
              <p className="truncate text-[13px] font-bold text-slate-800 dark:text-white">{title}</p>
              <span
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <InfoTooltip text={detail} label={`About ${title}`} />
              </span>
            </div>
            <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
              Hover chips for help · click for full section ↓
            </p>
          </div>
        </div>
        <ArrowDownRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 dark:text-white/45" aria-hidden />
      </div>

      <p className="mt-2 text-[12px] leading-snug text-slate-500 dark:text-white/55">{subtitle}</p>

      <HoverExplain
        text={hero.hint}
        label={`About ${hero.label}`}
        className="mt-3 w-full"
        placement="bottom"
      >
        <div className="w-full rounded-2xl bg-slate-50/90 px-4 py-3 transition-colors hover:bg-slate-100/90 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]">
          <p
            className={cn(
              "text-[2.15rem] font-extrabold leading-none tracking-tight tabular-nums",
              HERO_TONE[tone]
            )}
          >
            {hero.value}
          </p>
          <p className="mt-1.5 text-[12px] font-semibold text-slate-600 dark:text-white/70">{hero.label}</p>
        </div>
      </HoverExplain>

      <div className="mt-3 grid flex-1 grid-cols-2 gap-2">
        {visibleMetrics.map((metric) => (
          <HoverExplain
            key={metric.label}
            text={metric.hint}
            label={`About ${metric.label}`}
            className="min-w-0 w-full"
            placement="top"
          >
            <div
              className={cn(
                "min-w-0 w-full rounded-xl px-2.5 py-2 transition-shadow hover:shadow-sm hover:ring-1 hover:ring-slate-200/80 dark:hover:ring-white/15",
                METRIC_TONE[tone]
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
                {metric.label}
              </p>
              <p className="mt-0.5 break-words text-[13px] font-bold leading-snug text-slate-800 dark:text-white/85">
                {metric.value}
              </p>
            </div>
          </HoverExplain>
        ))}
      </div>
    </a>
  );
}
