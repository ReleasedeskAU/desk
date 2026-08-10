import { LIFECYCLE_STAGES } from "./lifecycle";
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  attentionStatusLabels,
  bucketReleaseStatusWithConfig,
  findLifecycleStatusByLabel,
} from "@/lib/release-lifecycle-status-ui";
import { isNeedsAttentionStatus } from "@/lib/needs-attention";
import type { LifecycleStageView } from "./types";

function isAttentionStatus(
  status: string,
  config?: ReleaseLifecycleConfig | null
): boolean {
  return isNeedsAttentionStatus(
    status,
    config ? attentionStatusLabels(config) : undefined
  );
}

function isTerminalShipped(
  status: string,
  config?: ReleaseLifecycleConfig | null
): boolean {
  return bucketReleaseStatusWithConfig(status, config) === "shipped";
}

function isRiskyDependencyStatus(
  status: string,
  config?: ReleaseLifecycleConfig | null
): boolean {
  const bucket = bucketReleaseStatusWithConfig(status, config);
  return bucket === "blocked" || bucket === "atRisk";
}

export type DbReleaseCommandInput = {
  id: string;
  releaseCode: string;
  status: string;
  decision: string | null;
  releaseDate: Date | string;
  priority: string;
  impact: string;
  notes: string | null;
  applications: { application: { name: string } }[];
  dependsOn: { dependsOnRelease: { id: string; releaseCode: string; name: string; status: string } }[];
  bookings: { application: { name: string }; fromDate: Date | string; toDate: Date | string }[];
};

export type DbP1Issue = {
  externalId: string;
  title: string;
  status: string;
  source: string;
};

export type DbBlocker = { text: string; href?: string; severity?: string };

export type DbNextAction = { label: string; href: string; detail?: string };

/** Open Blocker-register rows (excludes resolved/closed). */
export function isOpenBlockerStatus(status: string): boolean {
  const s = status.toLowerCase();
  return !["resolved", "closed", "done", "mitigated", "cancelled", "canceled"].includes(s);
}

export type LiveBlockerInput = {
  id: string;
  blockerCode: string;
  blockerDescription: string;
  status: string;
  severity?: string;
};

/** Map Blocker model rows into the command-center / AI narrative shape. */
export function liveBlockersToCommandBlockers(rows: LiveBlockerInput[]): DbBlocker[] {
  return rows.filter((r) => isOpenBlockerStatus(r.status)).map((r) => ({
    text: `${r.blockerCode}: ${r.blockerDescription}`,
    href: `/blockers/${r.id}`,
    severity: r.severity,
  }));
}

function releaseDateMs(release: DbReleaseCommandInput): number {
  const d = release.releaseDate;
  return typeof d === "string" ? new Date(d).getTime() : d.getTime();
}

function daysUntilRelease(release: DbReleaseCommandInput): number {
  return Math.ceil((releaseDateMs(release) - Date.now()) / 86400000);
}

function isOpenP1(issue: DbP1Issue): boolean {
  const s = issue.status.toLowerCase();
  return s !== "closed" && s !== "done" && s !== "resolved";
}

/**
 * Derive command-center blockers using lifecycle interrupt/kind when config is provided.
 */
export function getDbBlockers(
  release: DbReleaseCommandInput,
  p1Issues: DbP1Issue[],
  config?: ReleaseLifecycleConfig | null
): DbBlocker[] {
  const blockers: DbBlocker[] = [];
  const daysUntil = daysUntilRelease(release);
  const bucket = bucketReleaseStatusWithConfig(release.status, config);

  if (bucket === "blocked") {
    blockers.push({ text: release.notes ?? "Release marked blocked — check audit trail" });
  }

  release.dependsOn
    .filter((d) => isRiskyDependencyStatus(d.dependsOnRelease.status, config))
    .forEach((d) => {
      blockers.push({
        text: `Dependency ${d.dependsOnRelease.releaseCode} is ${d.dependsOnRelease.status}`,
        href: `/releases/${d.dependsOnRelease.id}`,
      });
    });

  if (!release.bookings.length && !isTerminalShipped(release.status, config) && daysUntil <= 14) {
    blockers.push({ text: "No environment booking linked", href: "/booking" });
  }

  if (!release.decision && !isTerminalShipped(release.status, config) && daysUntil <= 7) {
    blockers.push({ text: "Go / No-Go decision not recorded before target date" });
  }

  if (!release.applications.length) {
    blockers.push({ text: "No applications linked to this release", href: `/releases/${release.id}` });
  }

  p1Issues.filter(isOpenP1).forEach((p) => {
    blockers.push({
      text: `${p.externalId}: ${p.title}`,
      href: `https://jira.example.com/browse/${p.externalId}`,
    });
  });

  if (
    bucket === "atRisk" &&
    !blockers.some((b) => /risk|roll|defer|reject/i.test(b.text))
  ) {
    blockers.push({
      text: `Release in ${release.status} — confirm env bookings and dependencies`,
    });
  }

  return blockers;
}

/**
 * Score readiness; status penalties follow lifecycle buckets when config is set.
 */
export function calcDbReadiness(
  release: DbReleaseCommandInput,
  p1Issues: DbP1Issue[],
  openLiveBlockerCount = 0,
  config?: ReleaseLifecycleConfig | null
): number {
  let score = 100;
  const bucket = bucketReleaseStatusWithConfig(release.status, config);

  if (bucket === "blocked") score -= 40;
  else if (bucket === "atRisk") score -= 25;
  else if (bucket === "planned") score -= 10;
  else if (bucket === "shipped") return 100;

  if (!release.decision) score -= 15;
  if (!release.bookings.length) score -= 15;
  if (!release.applications.length) score -= 10;

  const riskyDeps = release.dependsOn.filter((d) =>
    isRiskyDependencyStatus(d.dependsOnRelease.status, config)
  ).length;
  score -= Math.min(20, riskyDeps * 10);

  const openP1 = p1Issues.filter(isOpenP1).length;
  score -= Math.min(30, openP1 * 15);

  // Live Blocker register (same source as the Release detail Blockers panel)
  score -= Math.min(30, openLiveBlockerCount * 10);

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Legacy command-center stage strip (Planning→Deployment).
 * Status branching uses lifecycle buckets when config is provided.
 * Prefer ReleaseLifecycleStepper on the detail page for the real status rail.
 */
export function computeDbLifecycleStages(
  release: DbReleaseCommandInput,
  p1Issues: DbP1Issue[],
  blockers: DbBlocker[] = [],
  config?: ReleaseLifecycleConfig | null
): LifecycleStageView[] {
  const readiness = calcDbReadiness(release, p1Issues, blockers.length, config);
  const daysUntil = daysUntilRelease(release);
  const hasBooking = release.bookings.length > 0;
  const hasApps = release.applications.length > 0;
  const bucket = bucketReleaseStatusWithConfig(release.status, config);
  const current = config
    ? findLifecycleStatusByLabel(config, release.status)
    : null;

  let activeIdx = 0;

  if (bucket === "shipped") {
    activeIdx = 5;
  } else if (release.decision?.startsWith("No-Go")) {
    activeIdx = 4;
  } else if (release.decision?.startsWith("Go")) {
    activeIdx = bucket === "inProgress" ? 5 : 4;
  } else if (blockers.length > 0 || readiness < 70 || isAttentionStatus(release.status, config)) {
    activeIdx = 3;
  } else if (!hasBooking && daysUntil <= 14) {
    activeIdx = 1;
  } else if (hasApps && hasBooking) {
    activeIdx = 3;
  } else if (hasApps) {
    activeIdx = 2;
  } else if (current && current.sortOrder <= 20) {
    activeIdx = 0;
  } else {
    activeIdx = 0;
  }

  const appNames = release.applications.map((a) => a.application.name).join(", ") || "None";
  const bookingDetail = hasBooking
    ? `${release.bookings.length} booking(s) linked`
    : daysUntil <= 14
      ? "Book env before target"
      : "No booking yet";

  const details: Record<string, string> = {
    planning: `${appNames} · ${release.priority} priority`,
    scheduling: `Target ${new Date(releaseDateMs(release)).toLocaleDateString("en-AU")}`,
    testing: hasApps ? "Apps scoped — validate in TEST/UAT" : "Link applications first",
    preparing:
      blockers.length > 0
        ? `${blockers.length} blocker(s) · ${readiness}% ready`
        : `${readiness}% readiness`,
    managing: release.decision ?? "Awaiting Go / No-Go",
    deployment:
      bucket === "shipped"
        ? "Released"
        : bucket === "inProgress"
          ? "Deployment in progress"
          : "Ready to deploy",
  };

  return LIFECYCLE_STAGES.map((stage, idx) => {
    let status: LifecycleStageView["status"] = "pending";
    if (idx < activeIdx) status = "complete";
    else if (idx === activeIdx) {
      if (isAttentionStatus(release.status, config) && stage.id === "preparing")
        status = "blocked";
      else status = "active";
    }
    if (bucket === "shipped") status = "complete";

    return {
      id: stage.id,
      label: stage.label,
      status,
      detail: stage.id === "scheduling" ? bookingDetail : details[stage.id],
    };
  });
}

/**
 * Suggested next actions; attention statuses come from lifecycle interrupt kinds.
 */
export function getDbNextActions(
  release: DbReleaseCommandInput,
  blockers: DbBlocker[],
  config?: ReleaseLifecycleConfig | null
): DbNextAction[] {
  const actions: DbNextAction[] = [];
  const daysUntil = daysUntilRelease(release);

  if (isAttentionStatus(release.status, config)) {
    actions.push({
      label: "Review blockers",
      href: `#blockers`,
      detail: blockers[0]?.text ?? "Check release notes and dependencies",
    });
  }

  if (!release.bookings.length && !isTerminalShipped(release.status, config)) {
    actions.push({ label: "Book environment", href: "/booking", detail: "Reserve TEST/UAT for this release" });
  }

  if (!release.decision && daysUntil <= 14 && !isTerminalShipped(release.status, config)) {
    actions.push({
      label: "Record Go / No-Go",
      href: `#go-nogo`,
      detail: `Target in ${daysUntil} day(s)`,
    });
  }

  if (release.dependsOn.length) {
    actions.push({
      label: "Check dependencies",
      href: `/releases/${release.id}/dependencies`,
      detail: `${release.dependsOn.length} upstream release(s)`,
    });
  }

  actions.push({ label: "System mapping", href: "/system-mapping", detail: "Verify downstream env availability" });

  return actions.slice(0, 4);
}
