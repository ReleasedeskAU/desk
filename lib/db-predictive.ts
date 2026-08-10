import {
  calcDbReadiness,
  type DbBlocker,
  type DbP1Issue,
  type DbReleaseCommandInput,
} from "./db-release-command";
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import { bucketReleaseStatusWithConfig } from "@/lib/release-lifecycle-status-ui";

export type DbReleasePrediction = {
  shipProbability: number;
  delayRisk: number;
  nudge: string;
  severity: "low" | "medium" | "high";
};

function daysUntil(releaseDate: Date | string): number {
  const d = typeof releaseDate === "string" ? new Date(releaseDate) : releaseDate;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

/**
 * Heuristic ship / delay prediction using lifecycle status buckets when config is set.
 */
export function predictDbRelease(
  release: DbReleaseCommandInput,
  p1Issues: DbP1Issue[],
  blockers: DbBlocker[] = [],
  config?: ReleaseLifecycleConfig | null
): DbReleasePrediction {
  const readiness = calcDbReadiness(release, p1Issues, blockers.length, config);
  const days = daysUntil(release.releaseDate);
  const bucket = bucketReleaseStatusWithConfig(release.status, config);

  let shipProbability = readiness * 0.85 + 10;
  if (bucket === "blocked") shipProbability -= 35;
  else if (bucket === "atRisk") shipProbability -= 20;
  if (!release.bookings.length && days <= 14) shipProbability -= 15;
  if (!release.decision && days <= 7) shipProbability -= 12;
  shipProbability = Math.max(0, Math.min(100, Math.round(shipProbability)));

  let delayRisk = blockers.length * 10;
  if (bucket === "atRisk") delayRisk += 20;
  if (bucket === "blocked") delayRisk += 35;
  if (days <= 7 && readiness < 70) delayRisk += 15;
  delayRisk = Math.max(0, Math.min(100, Math.round(delayRisk)));

  let nudge: string;
  let severity: DbReleasePrediction["severity"] = "low";

  if (bucket === "blocked") {
    nudge = `${release.status} — ${blockers[0]?.text ?? "review blockers before standup"}`;
    severity = "high";
  } else if (delayRisk >= 60 || (days <= 5 && readiness < 60)) {
    nudge =
      days <= 3
        ? `Target in ${days}d at ${readiness}% — escalation likely`
        : `${delayRisk}% slip risk — ${blockers[0]?.text ?? "address readiness gaps"}`;
    severity = "high";
  } else if (bucket === "atRisk" || delayRisk >= 40) {
    nudge = `${release.status} — ${blockers[0]?.text ?? "confirm bookings and dependencies"}`;
    severity = "medium";
  } else if (!release.bookings.length && days <= 10) {
    nudge = `No env booked — target in ${days} day(s)`;
    severity = "medium";
  } else if (!release.decision && days <= 7) {
    nudge = `Go / No-Go needed — ${days} day(s) to target`;
    severity = "medium";
  } else if (readiness >= 80 && days <= 14) {
    nudge = `On track at ${readiness}% — confirm Go / No-Go this week`;
    severity = "low";
  } else {
    nudge = `${readiness}% ready · target in ${days}d`;
    severity = "low";
  }

  return { shipProbability, delayRisk, nudge, severity };
}
