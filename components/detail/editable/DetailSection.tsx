"use client";

import { useState, type ReactNode, type SyntheticEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
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
  /** Longer plain-English explanation shown in the "?" tooltip. Falls back to `description` if omitted. */
  detail?: string;
  /** Pastel tone for the icon chip — match content (risk→rose, dates→violet, etc.). */
  tone?: SectionTone;
  children: ReactNode;
  className?: string;
  id?: string;
  /**
   * When true, body is wrapped in a collapsible `<details>` so users can collapse after reading.
   */
  collapsible?: boolean;
  /** Initial open state when collapsible (default true — content visible on first visit). */
  defaultOpen?: boolean;
};

/**
 * Soft elevated section card with colored icon chip.
 * "?" sits beside the title; the chevron alone sits on the far right for expand/collapse.
 *
 * @param props - Section chrome, body, and optional collapse behavior.
 * @returns Section or details/summary card.
 */
export function DetailSection({
  icon: Icon,
  title,
  description,
  detail,
  tone = "indigo",
  children,
  className,
  id,
  collapsible = false,
  defaultOpen = true,
}: DetailSectionProps) {
  // Controlled open state so "open by default" is reliable across remounts / hydration.
  const [open, setOpen] = useState(defaultOpen);

  const shellClass = cn(
    "rounded-[20px] bg-white p-5 shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] transition-shadow duration-150 hover:shadow-[0_20px_44px_-20px_rgba(112,144,176,0.35)] dark:bg-[var(--card)] dark:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.55)] dark:hover:shadow-[0_20px_44px_-20px_rgba(0,0,0,0.65)]",
    id && "scroll-mt-24",
    className
  );

  const onToggle = (e: SyntheticEvent<HTMLDetailsElement>) => {
    setOpen(e.currentTarget.open);
  };

  const header = (
    <>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            SECTION_ICON_TONE[tone]
          )}
        >
          <Icon size={16} aria-hidden />
        </span>
        {/* Title + "?" stay together; chevron is pushed to the far right alone. */}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <h3 className="truncate text-[14px] font-bold text-slate-800 dark:text-white">{title}</h3>
          {/* preventDefault stops the <summary> toggle when the user only wants the tip. */}
          <span
            className="shrink-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <InfoTooltip text={detail ?? description} label={`About ${title}`} />
          </span>
        </div>
        {collapsible ? (
          <ChevronDown
            className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180 dark:text-white/45"
            aria-hidden
          />
        ) : null}
      </div>
      <p className="mb-0 ml-[46px] mt-0.5 text-[11.5px] leading-snug text-slate-400 dark:text-white/50">
        {description}
      </p>
    </>
  );

  if (collapsible) {
    return (
      <details
        id={id}
        open={open}
        onToggle={onToggle}
        className={cn(shellClass, "group")}
      >
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          {header}
          <p className="ml-[46px] mt-1 text-[11px] font-semibold text-indigo-600 group-open:hidden dark:text-indigo-300">
            Click to expand
          </p>
          <p className="ml-[46px] mt-1 hidden text-[11px] font-semibold text-slate-400 group-open:block dark:text-white/40">
            Click to collapse
          </p>
        </summary>
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-[var(--border)]">{children}</div>
      </details>
    );
  }

  return (
    <section id={id} className={shellClass}>
      <div className="mb-1">{header}</div>
      <div className="mt-3">{children}</div>
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
