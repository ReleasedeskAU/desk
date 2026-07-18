"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SectionTone = "indigo" | "rose" | "emerald" | "sky" | "violet" | "amber";

const SECTION_ICON_TONE: Record<SectionTone, string> = {
  indigo: "bg-indigo-50 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300",
  rose: "bg-rose-50 text-rose-500 dark:bg-rose-500/15 dark:text-rose-300",
  emerald: "bg-emerald-50 text-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300",
  sky: "bg-sky-50 text-sky-500 dark:bg-sky-500/15 dark:text-sky-300",
  violet: "bg-violet-50 text-violet-500 dark:bg-violet-500/15 dark:text-violet-300",
  amber: "bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-300",
};

type DetailSectionProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Pastel tone for the icon chip — match content (risk→rose, dates→violet, etc.). */
  tone?: SectionTone;
  children: ReactNode;
  className?: string;
  id?: string;
};

/**
 * Soft elevated section card with colored icon chip (matches ReleaseDetailRedesign).
 */
export function DetailSection({
  icon: Icon,
  title,
  description,
  tone = "indigo",
  children,
  className,
  id,
}: DetailSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-[22px] bg-white p-6 shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] transition-shadow duration-300 hover:shadow-[0_20px_44px_-20px_rgba(112,144,176,0.35)] dark:bg-[var(--card)] dark:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.55)] dark:hover:shadow-[0_20px_44px_-20px_rgba(0,0,0,0.65)]",
        id && "scroll-mt-24",
        className
      )}
    >
      <div className="mb-1 flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            SECTION_ICON_TONE[tone]
          )}
        >
          <Icon size={16} aria-hidden />
        </span>
        <h3 className="text-[14px] font-bold text-slate-800 dark:text-white">{title}</h3>
      </div>
      <p className="mb-4 ml-[46px] text-[11.5px] leading-snug text-slate-400 dark:text-white/50">
        {description}
      </p>
      {children}
    </section>
  );
}

type EmptyHintProps = { children: ReactNode };

/** Inviting empty state — never a blank gap that looks broken. */
export function EmptyHint({ children }: EmptyHintProps) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2.5 text-[12.5px] text-slate-500 dark:border-[var(--border)] dark:bg-white/[0.03] dark:text-white/50">
      {children}
    </p>
  );
}

type TintedCalloutProps = {
  children: ReactNode;
  tone?: "rose" | "amber" | "sky" | "emerald" | "violet";
  className?: string;
};

const CALLOUT_TONE: Record<NonNullable<TintedCalloutProps["tone"]>, string> = {
  rose: "bg-rose-50/60 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200",
  amber: "bg-amber-50/70 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200",
  sky: "bg-sky-50/70 text-sky-900 dark:bg-sky-500/10 dark:text-sky-200",
  emerald: "bg-emerald-50/70 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200",
  violet: "bg-violet-50/70 text-violet-900 dark:bg-violet-500/10 dark:text-violet-200",
};

/** Notes / description callout — tinted box, not a plain paragraph. */
export function TintedCallout({ children, tone = "rose", className }: TintedCalloutProps) {
  return (
    <div className={cn("rounded-xl p-3 text-[12.5px] leading-relaxed", CALLOUT_TONE[tone], className)}>
      {children}
    </div>
  );
}
