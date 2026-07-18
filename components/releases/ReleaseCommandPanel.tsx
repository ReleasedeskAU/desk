"use client";

import { useId, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
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

export type ReleaseCommandPanelProps = {
  icon: LucideIcon;
  title: string;
  tone?: SectionTone;
  /** 1–2 line collapsed summary; always visible in the header when provided. */
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** When false, content is always shown (AI Insights, action strips). */
  collapsible?: boolean;
  id?: string;
  className?: string;
  description?: string;
};

/**
 * Command-center panel with left accent bar. Collapsible panels show a short
 * summary by default and expand inline to reveal the full existing section body.
 *
 * @param props - Panel chrome, summary, and body content.
 * @returns Section element with optional expand/collapse control.
 */
export function ReleaseCommandPanel({
  icon: Icon,
  title,
  tone = "indigo",
  summary,
  children,
  defaultOpen = false,
  collapsible = true,
  id,
  className,
  description,
}: ReleaseCommandPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const contentId = `${panelId}-content`;
  const expanded = !collapsible || open;

  return (
    <section
      id={id}
      className={cn(
        "rounded-[22px] border border-slate-100/80 border-l-[4px] bg-white shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] transition-shadow duration-300 hover:shadow-[0_20px_44px_-20px_rgba(112,144,176,0.35)] dark:border-[var(--border)] dark:bg-[var(--card)] dark:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.55)] dark:hover:shadow-[0_20px_44px_-20px_rgba(0,0,0,0.65)]",
        ACCENT_BORDER[tone],
        className
      )}
    >
      {collapsible ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-start gap-3 px-5 py-4 text-left"
        >
          <span
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              ICON_TONE[tone]
            )}
          >
            <Icon size={16} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-bold text-slate-800 dark:text-white">{title}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-slate-400 transition-transform dark:text-white/45",
                  expanded && "rotate-180"
                )}
                aria-hidden
              />
            </span>
            <span className="mt-1 block text-[12.5px] leading-snug text-slate-500 dark:text-white/55">
              {summary}
            </span>
          </span>
        </button>
      ) : (
        <div className="flex items-start gap-3 px-5 pt-5 pb-1">
          <span
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              ICON_TONE[tone]
            )}
          >
            <Icon size={16} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-bold text-slate-800 dark:text-white">{title}</h3>
            {description && (
              <p className="mt-1 text-[11.5px] leading-snug text-slate-400 dark:text-white/50">
                {description}
              </p>
            )}
            {summary && (
              <p className="mt-1 text-[12.5px] leading-snug text-slate-500 dark:text-white/55">{summary}</p>
            )}
          </div>
        </div>
      )}

      {expanded && (
        <div
          id={contentId}
          className={cn("px-5 pb-5", collapsible && "border-t border-slate-100 pt-4 dark:border-[var(--border)]")}
        >
          {children}
        </div>
      )}
    </section>
  );
}
