/**
 * Shared vocabulary for the decision-first detail layout (DECIDE → PROVE → TRACE).
 *
 * Every entity detail page must answer one question in its first viewport:
 * can a release manager act on this record now, or is it stuck? These helpers
 * turn entity-specific fields into the small set of shapes the DECIDE zone
 * renders, so all detail pages agree on ordering, urgency rules, and tone
 * instead of each page inventing its own.
 *
 * Pure module — no React, no DOM — so the urgency rules stay unit-testable.
 */

/** Mandatory zone order for every detail page. */
export const DETAIL_ZONE_ORDER = ["decide", "prove", "trace"] as const;

export type DetailZone = (typeof DETAIL_ZONE_ORDER)[number];

/** Attention is deliberately limited to red/amber — green is the absence of items. */
export type DetailAttentionTone = "critical" | "warning";

export type DetailAttentionItem = {
  /** Stable key; also used to drop duplicate conditions. */
  id: string;
  tone: DetailAttentionTone;
  label: string;
  /** Optional one-line explanation of why this is blocking. */
  detail?: string;
  /** Anchor (`#section-id`) or route to jump to the section that resolves it. */
  href?: string;
};

/** Declarative form used by pages: describe every condition, flag which are live. */
export type DetailAttentionCandidate = DetailAttentionItem & { when: boolean };

const ATTENTION_TONE_RANK: Record<DetailAttentionTone, number> = {
  critical: 0,
  warning: 1,
};

/**
 * Reduce declared attention conditions to the ones currently firing.
 *
 * Critical items sort ahead of warnings; declaration order is preserved inside
 * a tone so each page keeps control of its own priority. Duplicate ids are
 * dropped (first wins) because several rules can describe the same problem.
 *
 * @param candidates - Every condition the page knows about, with `when` set.
 * @returns Firing items, criticals first. Empty array means "all clear".
 */
export function collectAttention(
  candidates: readonly DetailAttentionCandidate[]
): DetailAttentionItem[] {
  const seen = new Set<string>();
  const active: DetailAttentionItem[] = [];

  for (const candidate of candidates) {
    if (!candidate.when || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const { when: _when, ...item } = candidate;
    active.push(item);
  }

  return active.sort(
    (a, b) => ATTENTION_TONE_RANK[a.tone] - ATTENTION_TONE_RANK[b.tone]
  );
}

export type DetailAttentionSummary = {
  tone: DetailAttentionTone | "clear";
  criticalCount: number;
  warningCount: number;
  headline: string;
};

export const DEFAULT_ATTENTION_CLEAR_LABEL =
  "No blockers, conflicts or overdue gates";

/**
 * Headline for the attention strip so the first viewport reads as a verdict.
 *
 * @param items - Output of `collectAttention`.
 * @param clearLabel - Copy shown when nothing is firing.
 * @returns Tone plus counts and a single-line headline.
 */
export function summarizeAttention(
  items: readonly DetailAttentionItem[],
  clearLabel: string = DEFAULT_ATTENTION_CLEAR_LABEL
): DetailAttentionSummary {
  const criticalCount = items.filter((item) => item.tone === "critical").length;
  const warningCount = items.length - criticalCount;

  if (items.length === 0) {
    return { tone: "clear", criticalCount: 0, warningCount: 0, headline: clearLabel };
  }

  const [first] = items;
  return {
    tone: criticalCount > 0 ? "critical" : "warning",
    criticalCount,
    warningCount,
    headline:
      items.length === 1 && first
        ? first.label
        : `${items.length} items need attention`,
  };
}

export type DetailDueState = "overdue" | "today" | "soon" | "scheduled" | "unknown";

export type DetailDue = {
  state: DetailDueState;
  label: string;
  /** Whole days until the date; negative when past. Null when unparseable. */
  days: number | null;
};

/** A gate landing within this many days is treated as imminent, not merely scheduled. */
export const DEFAULT_DUE_SOON_DAYS = 3;

const MS_PER_DAY = 86_400_000;

/**
 * Describe a date the way a release manager reads a calendar: overdue, today,
 * imminent, or simply scheduled.
 *
 * @param value - ISO date string or Date. Missing/unparseable yields `unknown`.
 * @param options.now - Reference time, injectable for tests.
 * @param options.soonWithinDays - Threshold for the `soon` state.
 * @returns State, display label, and whole-day delta.
 */
export function describeDue(
  value: string | Date | null | undefined,
  options: { now?: Date; soonWithinDays?: number } = {}
): DetailDue {
  if (value == null || value === "") return { state: "unknown", label: "—", days: null };

  const target = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(target.getTime())) return { state: "unknown", label: "—", days: null };

  const now = options.now ?? new Date();
  const soonWithinDays = options.soonWithinDays ?? DEFAULT_DUE_SOON_DAYS;
  const days = Math.ceil((target.getTime() - now.getTime()) / MS_PER_DAY);

  if (days < 0) {
    const overdueBy = Math.abs(days);
    return {
      state: "overdue",
      label: `Overdue by ${overdueBy} day${overdueBy === 1 ? "" : "s"}`,
      days,
    };
  }
  if (days === 0) return { state: "today", label: "Today", days };

  const label = `In ${days} day${days === 1 ? "" : "s"}`;
  return { state: days <= soonWithinDays ? "soon" : "scheduled", label, days };
}

export type DetailFactTone = "neutral" | "good" | "warn" | "bad";

/** Label/value pair rendered in the Timing and Scope columns of the DECIDE zone. */
export type DetailFact = {
  label: string;
  value: string;
  tone?: DetailFactTone;
  /** Plain-English explanation surfaced on hover. */
  hint?: string;
  /** Anchor or route when the fact drills into more detail. */
  href?: string;
};

/**
 * Map a due state onto the shared fact tone so timing rows colour consistently.
 *
 * @param state - Result of `describeDue`.
 * @returns Tone for the timing fact.
 */
export function dueTone(state: DetailDueState): DetailFactTone {
  if (state === "overdue") return "bad";
  if (state === "today" || state === "soon") return "warn";
  return "neutral";
}

/**
 * Reuse an existing `StatusChip` tone for a header fact. The two scales are
 * identical apart from "info", which has no distinct fact colour.
 *
 * @param tone - Chip tone from an entity's existing status/severity helper.
 * @returns Equivalent fact tone.
 */
export function chipToneToFactTone(
  tone: "neutral" | "good" | "warn" | "bad" | "info"
): DetailFactTone {
  return tone === "info" ? "neutral" : tone;
}

export type DetailAction = {
  id: string;
  label: string;
  /** Plain-English explanation of what this action does. */
  hint?: string;
  /** Navigation target. Mutually exclusive with `onClick` in practice. */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  pending?: boolean;
  /**
   * Marks an action that mutates data. Write actions are hidden from viewers.
   * This is a convenience affordance only — the API route remains the sole
   * authority on permission, so hiding the control is never the access check.
   */
  write?: boolean;
};

/**
 * Filter actions a viewer is allowed to see.
 *
 * Read-only navigation stays available to everyone; write actions require an
 * editor session. Server-side authorization still runs on every request.
 *
 * @param actions - Candidate actions declared by the page.
 * @param canEdit - Whether the current session may mutate this entity.
 * @returns Actions safe to render for this session.
 */
export function visibleActions(
  actions: readonly DetailAction[],
  canEdit: boolean
): DetailAction[] {
  return actions.filter((action) => (action.write ? canEdit : true));
}
