import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Rocket,
} from "lucide-react";
import type { UnifiedRelease } from "@/lib/unified-releases";
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  findLifecycleStatusByLabel,
  type ReleaseStatusDisplayTone,
} from "@/lib/release-lifecycle-status-ui";

export type TimelineTone = "rose" | "amber" | "emerald" | "indigo" | "violet";

/**
 * Balloon / legend colors — solid hex so heads never render as white/black
 * (which disappear on light or dark canvases).
 */
export const TIMELINE_TONES: Record<
  TimelineTone,
  { chip: string; pill: string; track: string; solid: string }
> = {
  rose: {
    // Blocked — vivid red (not near-black)
    chip: "bg-red-500",
    pill: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
    track: "from-red-400 to-red-500",
    solid: "#ef4444",
  },
  amber: {
    // At Risk — orange
    chip: "bg-orange-500",
    pill: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
    track: "from-orange-400 to-amber-500",
    solid: "#f97316",
  },
  emerald: {
    // Approved — green
    chip: "bg-emerald-500",
    pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    track: "from-emerald-400 to-teal-500",
    solid: "#10b981",
  },
  indigo: {
    // In Testing — bright blue (not pale/white)
    chip: "bg-sky-500",
    pill: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
    track: "from-sky-400 to-blue-500",
    solid: "#0ea5e9",
  },
  violet: {
    // Planning / CAB — purple (not grey)
    chip: "bg-fuchsia-500",
    pill: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300",
    track: "from-fuchsia-400 to-purple-500",
    solid: "#d946ef",
  },
};

/** Kind-based legend (lifecycle SSOT) — not hardcoded status names. */
export const TIMELINE_LEGEND: { tone: TimelineTone; label: string }[] = [
  { tone: "rose", label: "Interrupt" },
  { tone: "amber", label: "Branch" },
  { tone: "emerald", label: "Terminal" },
  { tone: "indigo", label: "Mainline (mid)" },
  { tone: "violet", label: "Mainline (early)" },
];

function displayToneToTimeline(tone: ReleaseStatusDisplayTone): TimelineTone {
  switch (tone) {
    case "bad":
      return "rose";
    case "warn":
      return "amber";
    case "good":
      return "emerald";
    case "info":
      return "indigo";
    default:
      return "violet";
  }
}

/**
 * Map a release status to timeline tone/icon.
 * When config is provided, uses lifecycle kind; otherwise falls back to legacy labels.
 */
export function mapReleaseStatusToTimeline(
  status: string,
  config?: ReleaseLifecycleConfig | null
): {
  tone: TimelineTone;
  label: string;
  icon: LucideIcon;
} {
  const found = config ? findLifecycleStatusByLabel(config, status) : null;
  if (found) {
    if (found.kind === "interrupt") {
      return { tone: "rose", label: found.label, icon: Ban };
    }
    if (found.kind === "branch") {
      return { tone: "amber", label: found.label, icon: AlertTriangle };
    }
    if (found.kind === "terminal") {
      return { tone: "emerald", label: found.label, icon: CheckCircle2 };
    }
    if (found.sortOrder <= 20 || found.key === "draft" || found.key === "planning") {
      return { tone: "violet", label: found.label, icon: Rocket };
    }
    if (found.key === "pending_cab") {
      return { tone: "violet", label: found.label, icon: Clock };
    }
    return { tone: "indigo", label: found.label, icon: Activity };
  }

  switch (status) {
    case "Blocked":
      return { tone: "rose", label: "Blocked", icon: Ban };
    case "At Risk":
    case "Rolled Back":
    case "Deferred":
    case "Rejected":
      return { tone: "amber", label: status, icon: AlertTriangle };
    case "Approved":
    case "CAB Approved":
    case "Complete":
    case "Completed":
    case "Shipped":
    case "Deployed":
    case "Closed":
      return { tone: "emerald", label: status, icon: CheckCircle2 };
    case "Testing":
    case "UAT":
    case "In Testing":
    case "In Progress":
    case "Ready":
    case "Ready to deploy":
    case "Deploying":
      return { tone: "indigo", label: status, icon: Activity };
    case "Pending CAB":
      return { tone: "violet", label: "Pending CAB", icon: Clock };
    case "Planning":
    case "Planned":
    case "Scheduled":
    case "Draft":
      return { tone: "violet", label: status, icon: Rocket };
    default:
      return {
        tone: displayToneToTimeline("neutral"),
        label: status,
        icon: Rocket,
      };
  }
}

export type TimelineMilestone = {
  id: string;
  code: string;
  name: string;
  date: string;
  dateLabel: string;
  period: string;
  status: string;
  tone: TimelineTone;
  icon: LucideIcon;
  side: "up" | "down";
  href: string;
  note: string | null;
  _x: number;
};

/** A single release or a density cluster of nearby releases (year / dot timeline). */
export type TimelineMarker =
  | {
      kind: "single";
      id: string;
      side: "up" | "down";
      _x: number;
      /** Stem length in px — staggered when same-side neighbors are close. */
      stemHeight: number;
      milestone: TimelineMilestone;
    }
  | {
      kind: "cluster";
      id: string;
      side: "up" | "down";
      _x: number;
      stemHeight: number;
      count: number;
      /** Dominant / first tone for the cluster dot. */
      tone: TimelineTone;
      dateLabel: string;
      members: TimelineMilestone[];
    };

export function formatTimelineDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function formatTimelinePeriod(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}

export function buildStickyNote(release: UnifiedRelease): string | null {
  const blocker = release.blockers?.trim();
  if (blocker) return blocker.length > 48 ? `${blocker.slice(0, 45)}…` : blocker;
  if (release.conflictFlag) return "Env conflict flagged";
  return null;
}

const CARD_WIDTH = 200;
const DEFAULT_MIN_GAP = CARD_WIDTH + 28;
/**
 * Same-calendar-day releases share one cluster marker (dots would stack).
 * Remaining markers are then spread evenly across the track so dense months
 * don't pile up while leaving empty canvas on either side.
 */
export const DOT_LABEL_MIN_GAP = 96;
/** Minimum horizontal slot per marker when sizing a year track. */
export const DOT_SLOT_WIDTH = 108;

export function dateToX(
  date: string | Date,
  start: Date,
  end: Date,
  trackWidth: number,
  padding = 90,
): number {
  const innerWidth = Math.max(trackWidth - padding * 2, 120);
  const msRange = Math.max(end.getTime() - start.getTime(), 1);
  const t = (new Date(date).getTime() - start.getTime()) / msRange;
  return padding + Math.min(1, Math.max(0, t)) * innerWidth;
}

export type LayoutTimelineOptions = {
  /** Minimum horizontal gap between same-side milestones (card layout). */
  minGap?: number;
};

function toMilestone(
  r: UnifiedRelease,
  periodStart: Date,
  periodEnd: Date,
  trackWidth: number,
  padding: number,
  side: "up" | "down",
  x?: number,
  config?: ReleaseLifecycleConfig | null,
): TimelineMilestone {
  const mapped = mapReleaseStatusToTimeline(r.status, config);
  const _x = x ?? dateToX(r.date, periodStart, periodEnd, trackWidth, padding);
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    date: r.date,
    dateLabel: formatTimelineDate(r.date),
    period: formatTimelinePeriod(r.date),
    status: mapped.label,
    tone: mapped.tone,
    icon: mapped.icon,
    side,
    href: r.href,
    note: buildStickyNote(r),
    _x,
  };
}

/** Position milestones on the track; resolve same-day / close-date collisions (month/quarter cards). */
export function layoutTimelineMilestones(
  releases: UnifiedRelease[],
  periodStart: Date,
  periodEnd: Date,
  trackWidth: number,
  options?: LayoutTimelineOptions & {
    lifecycleConfig?: ReleaseLifecycleConfig | null;
  },
): TimelineMilestone[] {
  const padding = 90;
  const minGap = options?.minGap ?? DEFAULT_MIN_GAP;
  const config = options?.lifecycleConfig ?? null;
  const sorted = [...releases].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const placed: { x: number; side: "up" | "down" }[] = [];

  return sorted.map((r, i) => {
    let x = dateToX(r.date, periodStart, periodEnd, trackWidth, padding);
    let side: "up" | "down" = i % 2 === 0 ? "up" : "down";

    const collides = (cx: number, cside: "up" | "down") =>
      placed.some((p) => Math.abs(p.x - cx) < minGap && p.side === cside);

    let attempts = 0;
    while (collides(x, side) && attempts < 12) {
      if (attempts % 2 === 0) {
        side = side === "up" ? "down" : "up";
      } else {
        x += minGap * 0.35;
      }
      attempts++;
    }
    x = Math.min(Math.max(x, padding), trackWidth - padding);
    placed.push({ x, side });
    return toMilestone(
      r,
      periodStart,
      periodEnd,
      trackWidth,
      padding,
      side,
      x,
      config
    );
  });
}

/**
 * Year / balloon layout:
 * 1) Cluster same-calendar-day releases
 * 2) Spread markers evenly across the full track (uses empty canvas; keeps chrono order)
 * 3) Alternate above/below with light stem stagger
 */
export function layoutDotTimelineMarkers(
  releases: UnifiedRelease[],
  periodStart: Date,
  periodEnd: Date,
  trackWidth: number,
  options?: {
    labelMinGap?: number;
    lifecycleConfig?: ReleaseLifecycleConfig | null;
  },
): TimelineMarker[] {
  const padding = 64;
  const labelMinGap = options?.labelMinGap ?? DOT_LABEL_MIN_GAP;
  const config = options?.lifecycleConfig ?? null;
  const sorted = [...releases].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const dayKey = (d: string | Date) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  };

  // Cluster same-calendar-day releases first.
  type Bucket = { members: UnifiedRelease[] };
  const buckets: Bucket[] = [];
  for (const r of sorted) {
    const prev = buckets[buckets.length - 1];
    if (prev && dayKey(prev.members[0].date) === dayKey(r.date)) {
      prev.members.push(r);
    } else {
      buckets.push({ members: [r] });
    }
  }

  const n = buckets.length;
  const inner = Math.max(trackWidth - padding * 2, 120);
  // Evenly distribute across the full canvas so dense months don't crush together.
  const spreadX = (i: number) =>
    n <= 1 ? padding + inner / 2 : padding + (i / (n - 1)) * inner;

  type Node = { members: UnifiedRelease[]; x: number; side: "up" | "down" };
  const merged: Node[] = buckets.map((b, i) => ({
    members: b.members,
    x: spreadX(i),
    side: (i % 2 === 0 ? "up" : "down") as "up" | "down",
  }));

  // Flip side if same-side neighbor is still too close after spread.
  for (let i = 0; i < merged.length; i++) {
    let side = merged[i].side;
    const hit = merged
      .slice(0, i)
      .some((p) => p.side === side && Math.abs(p.x - merged[i].x) < labelMinGap);
    if (hit) side = side === "up" ? "down" : "up";
    merged[i].side = side;
  }

  const STEM_BASE = 52;
  const STEM_STEP = 22;
  const stemHeights = merged.map((_, i) => STEM_BASE + (i % 4 < 2 ? 0 : STEM_STEP));

  return merged.map((node, i) => {
    const members = node.members.map((r) =>
      toMilestone(
        r,
        periodStart,
        periodEnd,
        trackWidth,
        padding,
        node.side,
        node.x,
        config
      ),
    );
    const stemHeight = stemHeights[i];
    if (members.length === 1) {
      return {
        kind: "single" as const,
        id: members[0].id,
        side: node.side,
        _x: node.x,
        stemHeight,
        milestone: { ...members[0], side: node.side, _x: node.x },
      };
    }
    const first = members[0];
    const last = members[members.length - 1];
    const dateLabel =
      first.dateLabel === last.dateLabel
        ? first.dateLabel
        : `${first.dateLabel} – ${last.dateLabel}`;
    return {
      kind: "cluster" as const,
      id: `cluster-${members.map((m) => m.id).join("-")}`,
      side: node.side,
      _x: node.x,
      stemHeight,
      count: members.length,
      tone: members[0].tone,
      dateLabel,
      members,
    };
  });
}

/** Month tick marks: "1 May", "1 Jun", … at the 1st of each month. */
export function buildMonthAxisLabels(
  periodStart: Date,
  periodEnd: Date,
  trackWidth: number,
): { label: string; x: number }[] {
  const padding = 56;
  const labels: { label: string; x: number }[] = [];
  const cursor = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
  if (cursor < periodStart) cursor.setMonth(cursor.getMonth() + 1);
  const end = periodEnd.getTime();
  while (cursor.getTime() <= end) {
    const day = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    labels.push({
      label: `1 ${day.toLocaleDateString("en-AU", { month: "short" })}`,
      x: dateToX(day, periodStart, periodEnd, trackWidth, padding),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return labels;
}

/** Expand View track: at least viewport-wide; grow with release count so slots stay readable. */
export function fitYearTrackWidth(viewportWidth: number, releaseCount: number): number {
  const usable = Math.max(viewportWidth - 96, 640);
  const byCount = Math.max(usable, releaseCount * DOT_SLOT_WIDTH + 128);
  return byCount;
}

/** Card-view year track: sized so markers can spread without crushing. */
export function yearTimelineTrackWidth(count: number): number {
  return Math.max(1600, count * DOT_SLOT_WIDTH + 160);
}

export function formatTodayMarkerLabel(date = new Date()): string {
  const day = String(date.getDate()).padStart(2, "0");
  const mon = date.toLocaleDateString("en-AU", { month: "short" });
  return `TODAY ${day}-${mon}`;
}

export type TimelinePeriodSegment = {
  period: string;
  x1: number;
  x2: number;
  tone: TimelineTone;
};

export function buildPeriodSegments(milestones: TimelineMilestone[]): TimelinePeriodSegment[] {
  const segments: TimelinePeriodSegment[] = [];
  for (const m of milestones) {
    const last = segments[segments.length - 1];
    if (last && last.period === m.period) {
      last.x2 = m._x;
    } else {
      segments.push({ period: m.period, x1: m._x, x2: m._x, tone: m.tone });
    }
  }
  return segments;
}

export function timelineTrackWidth(count: number): number {
  return Math.max(1100, count * 240);
}

export const TIMELINE_TRACK_HEIGHT = 520;
/** Axis at vertical center of the track. */
export const TIMELINE_AXIS_PERCENT = 50;
/** Default year-dot track height (taller to fit staggered stems). */
export const YEAR_DOT_TRACK_HEIGHT = 460;

export function timelineRangeLabel(start: Date, end: Date): string {
  const sameMonth =
    start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  if (sameMonth) {
    return start.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  }
  const a = start.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
  const b = end.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
  return `${a} – ${b}`;
}
