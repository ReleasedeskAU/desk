"use client";

import type { ReactNode } from "react";
import { CalendarClock, Network } from "lucide-react";
import { HoverExplain } from "@/components/ui/InfoTooltip";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { StatusChip, type ChipTone } from "@/components/detail/editable";
import { DetailAttentionStrip } from "@/components/detail/decision/DetailAttentionStrip";
import { DetailPrimaryAction } from "@/components/detail/decision/DetailPrimaryAction";
import {
  summarizeAttention,
  type DetailAction,
  type DetailAttentionItem,
  type DetailFact,
  type DetailFactTone,
} from "@/lib/detail-decision";
import { cn } from "@/lib/utils";

const ACCENT_BY_TONE = {
  critical: "border-l-rose-500",
  warning: "border-l-amber-500",
  clear: "border-l-emerald-500",
} as const;

const FACT_VALUE_TONE: Record<DetailFactTone, string> = {
  neutral: "text-slate-800 dark:text-white/85",
  good: "text-emerald-600 dark:text-emerald-300",
  warn: "text-amber-600 dark:text-amber-300",
  bad: "text-rose-600 dark:text-rose-300",
};

export type DetailDecisionHeaderProps = {
  /**
   * Entity code and name. Omit both when the surrounding shell already renders
   * them as the page heading — repeating them here is noise, not orientation.
   */
  code?: string;
  title?: string;
  /** Owner, program, department — the "what am I looking at" line. */
  identity?: DetailFact[];
  status: { label: string; tone: ChipTone; caption?: string };
  /** Headline metrics that inform the decision (readiness, slip risk, score). */
  signals?: DetailFact[];
  primaryAction?: DetailAction | null;
  secondaryActions?: DetailAction[];
  /**
   * Copy for the next-step slot when no action applies. Reference records have
   * no lifecycle to advance, so "nothing to do" needs saying in their own terms.
   */
  actionEmptyLabel?: string;
  canEdit: boolean;
  /** Message shown when a header action fails, so writes never fail silently. */
  actionError?: string | null;
  attention: DetailAttentionItem[];
  attentionClearLabel?: string;
  /** Dates, windows and gates. Overdue/imminent items should carry a tone. */
  timing: DetailFact[];
  /** Plain-language line under Timing — what these dates mean for this record. */
  timingDescription?: string;
  /** Blast radius: systems, environments, dependent records. */
  scope: DetailFact[];
  /** Plain-language line under Scope — who/what is affected. */
  scopeDescription?: string;
  className?: string;
};

/**
 * DECIDE zone shared by every entity detail page.
 *
 * Fixed order — identity, status, scoreboard, attention, next action, timing,
 * scope — so a release manager can answer "can I act on this now, or is it
 * stuck?" without scrolling. Shell-agnostic: same look inside
 * `DetailPageShell` and `EditableDetailShell`.
 *
 * Visual rule: one outer shell, no nested cards. Metrics are a scoreboard
 * strip; timing/scope are flat definition lists.
 *
 * @param props - Entity identity plus the five DECIDE slots.
 * @returns Decision header panel.
 */
export function DetailDecisionHeader({
  code,
  title,
  identity = [],
  status,
  signals = [],
  primaryAction,
  secondaryActions,
  actionEmptyLabel,
  canEdit,
  actionError,
  attention,
  attentionClearLabel,
  timing,
  timingDescription = "Key dates that decide whether this record is on track or late.",
  scope,
  scopeDescription = "Who and what is affected if this record stays unresolved.",
  className,
}: DetailDecisionHeaderProps) {
  // The left accent encodes the verdict, so the page reads as safe or stuck
  // before any text is parsed.
  const accent = ACCENT_BY_TONE[summarizeAttention(attention, attentionClearLabel).tone];
  const factColumns = [
    {
      icon: <CalendarClock size={14} aria-hidden />,
      title: "Timing",
      description: timingDescription,
      facts: timing,
    },
    {
      icon: <Network size={14} aria-hidden />,
      title: "Scope & impact",
      description: scopeDescription,
      facts: scope,
    },
  ].filter((column) => column.facts.length > 0);

  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200/80 border-l-[4px] bg-white dark:border-[var(--border)] dark:bg-[var(--card)]",
        accent,
        className
      )}
    >
      <div className="px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            {title ? (
              <div className="flex flex-wrap items-center gap-2">
                {code ? (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600 dark:bg-white/10 dark:text-white/70">
                    {code}
                  </span>
                ) : null}
                <h2 className="min-w-0 truncate text-[15px] font-bold text-slate-900 dark:text-white">
                  {title}
                </h2>
              </div>
            ) : null}
            {identity.length ? (
              <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", title && "mt-1")}>
                {identity.map((fact) => (
                  <span key={fact.label} className="text-[12px] text-slate-500 dark:text-white/55">
                    <span className="text-slate-400 dark:text-white/40">{fact.label} </span>
                    <FactValue fact={fact} inline />
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <StatusChip label={status.label} tone={status.tone} />
            {status.caption ? (
              <span className="text-[11px] text-slate-400 dark:text-white/45">{status.caption}</span>
            ) : null}
          </div>
        </div>
      </div>

      {signals.length ? (
        <div
          className={cn(
            "grid border-y border-slate-100 dark:border-[var(--border)]",
            signals.length === 1 && "grid-cols-1",
            signals.length === 2 && "grid-cols-2",
            signals.length === 3 && "grid-cols-3",
            signals.length >= 4 && "grid-cols-2 sm:grid-cols-4"
          )}
        >
          {signals.map((signal, index) => (
            <SignalCell
              key={signal.label}
              fact={signal}
              className={signalCellBorder(index, signals.length)}
            />
          ))}
        </div>
      ) : null}

      <div className="space-y-3 px-5 py-4 sm:px-6">
        <DetailAttentionStrip items={attention} clearLabel={attentionClearLabel} />

        {/* Only show when there is a real next step (or an entity-specific empty
            label). Releases omit this — sidebar already covers navigation CTAs. */}
        {primaryAction || (secondaryActions?.length ?? 0) > 0 || actionEmptyLabel != null ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
              Next
            </span>
            <DetailPrimaryAction
              primary={primaryAction}
              secondary={secondaryActions}
              emptyLabel={actionEmptyLabel}
              canEdit={canEdit}
            />
          </div>
        ) : null}
        {actionError ? (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"
          >
            {actionError}
          </p>
        ) : null}

        {factColumns.length ? (
          <div
            className={cn(
              "grid grid-cols-1 gap-x-8 gap-y-4 border-t border-slate-100 pt-3 dark:border-[var(--border)]",
              factColumns.length > 1 && "sm:grid-cols-2"
            )}
          >
            {factColumns.map((column) => (
              <FactColumn
                key={column.title}
                icon={column.icon}
                title={column.title}
                description={column.description}
                facts={column.facts}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FactColumn({
  icon,
  title,
  description,
  facts,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  facts: DetailFact[];
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-slate-400 dark:text-white/45">
        {icon}
        <p className="text-[10.5px] font-semibold uppercase tracking-wide">{title}</p>
      </div>
      {description ? (
        <p className="mb-2.5 text-[12px] leading-snug text-slate-500 dark:text-white/55">{description}</p>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
              {fact.label}
            </dt>
            <dd className="mt-0.5 text-[13px] font-semibold leading-snug">
              <FactValue fact={fact} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const CELL_LINE = "border-slate-100 dark:border-[var(--border)]";

/**
 * Hairlines between scoreboard cells. Four metrics use a 2×2 grid on narrow
 * viewports, so the third cell must not inherit a left border from the row above.
 *
 * @param index - Zero-based cell index.
 * @param count - Total signal count.
 * @returns Border utility classes for the cell.
 */
function signalCellBorder(index: number, count: number): string {
  if (count >= 4) {
    return cn(
      CELL_LINE,
      index % 2 === 1 && "border-l",
      index >= 2 && "border-t sm:border-t-0",
      index > 0 && "sm:border-l"
    );
  }
  return cn(CELL_LINE, index > 0 && "border-l");
}

/**
 * One scoreboard cell. Dividers between cells replace nested card chrome so
 * the metrics row reads as a single band, not four floating boxes.
 *
 * @param props.fact - Label, value, optional tone / hint / href.
 * @param props.className - Border utilities from the scoreboard grid.
 * @returns Scoreboard cell.
 */
function SignalCell({ fact, className }: { fact: DetailFact; className?: string }) {
  const tone = fact.tone ?? "neutral";
  const body = (
    <div className={cn("flex h-full min-h-[104px] flex-col justify-center px-5 py-5 sm:px-6 sm:py-6", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/45">
        {fact.label}
      </span>
      <span
        className={cn(
          "mt-2 text-[32px] font-extrabold leading-none tracking-tight tabular-nums sm:text-[36px]",
          FACT_VALUE_TONE[tone]
        )}
      >
        {fact.value}
      </span>
      {fact.hint ? (
        <span className="mt-2 line-clamp-2 text-[11px] leading-snug text-slate-400 dark:text-white/45">
          {fact.hint}
        </span>
      ) : null}
    </div>
  );

  const cell =
    fact.href != null ? (
      fact.href.startsWith("#") ? (
        <a
          href={fact.href}
          className="block h-full transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.03]"
          title={fact.hint}
        >
          {body}
        </a>
      ) : (
        <ProgressLink
          href={fact.href}
          className="block h-full transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.03]"
        >
          {body}
        </ProgressLink>
      )
    ) : (
      body
    );

  // Hint is shown under the value — no extra hover layer needed on the cell.
  return cell;
}

function FactValue({ fact, inline = false }: { fact: DetailFact; inline?: boolean }) {
  const valueClass = inline
    ? "font-semibold text-slate-600 dark:text-white/70"
    : FACT_VALUE_TONE[fact.tone ?? "neutral"];

  if (fact.href) {
    const linkClass = cn(valueClass, "underline decoration-dotted underline-offset-2 hover:opacity-80");
    return fact.href.startsWith("#") ? (
      <a href={fact.href} title={fact.hint} className={linkClass}>
        {fact.value}
      </a>
    ) : (
      <ProgressLink href={fact.href} className={linkClass}>
        {fact.value}
      </ProgressLink>
    );
  }

  if (fact.hint && !inline) {
    return (
      <HoverExplain text={fact.hint} label={`About ${fact.label}`}>
        <span className={valueClass}>{fact.value}</span>
      </HoverExplain>
    );
  }

  return <span className={valueClass}>{fact.value}</span>;
}
