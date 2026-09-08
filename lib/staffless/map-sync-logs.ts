/**
 * Combine StaffLess indexing-status, index attempts, and unresolved errors.
 * StaffLess does not expose separate “records found” vs “fetched” counts — those are omitted.
 */

import type { ConnectorTableRow } from "@/lib/staffless/map-indexing-status";
import type { StafflessIndexAttempt, StafflessIndexError } from "@/lib/staffless/map-index-attempts";

/** Poll while a run is queued or running. */
export const SYNC_LOGS_POLL_MS = 5_000;

export const SYNC_LOGS_RESULTS = [
  "not_started",
  "in_progress",
  "success",
  "failed",
  "canceled",
  "interrupted",
  "completed_with_errors",
  "pending",
] as const;

export type SyncLogsLastResult = (typeof SYNC_LOGS_RESULTS)[number];

const KNOWN_ENGINE_STATUS = new Set<string>(
  SYNC_LOGS_RESULTS.filter((value) => value !== "pending")
);

export type SyncLogsSummary = {
  docsIndexed: number;
  /** Latest attempt’s total_docs_indexed — null only when StaffLess has no attempt yet. */
  latestAttemptDocsIndexed: number | null;
  newDocsIndexed: number | null;
  inProgress: boolean;
  lastSyncAt: string | null;
  lastResult: SyncLogsLastResult;
  errorCount: number;
  lastError: string | null;
};

export type SyncLogsView = {
  connector: ConnectorTableRow;
  summary: SyncLogsSummary;
  attempts: StafflessIndexAttempt[];
  attemptsTotal: number;
  errors: StafflessIndexError[];
  errorsTotal: number;
};

/**
 * Layman label for a StaffLess index status.
 */
export function lastResultLabel(result: SyncLogsLastResult): string {
  switch (result) {
    case "not_started":
      return "Queued";
    case "in_progress":
      return "In progress";
    case "success":
      return "Succeeded";
    case "failed":
      return "Failed";
    case "canceled":
      return "Cancelled";
    case "interrupted":
      return "Interrupted";
    case "completed_with_errors":
      return "Completed with errors";
    default:
      return "Waiting for first sync";
  }
}

/**
 * Layman label for one index-attempt status string from StaffLess.
 */
export function indexAttemptStatusLabel(status: string | null): string {
  if (!status) return "—";
  if (KNOWN_ENGINE_STATUS.has(status)) return lastResultLabel(status as SyncLogsLastResult);
  return status.replaceAll("_", " ");
}

function coerceEngineStatus(value: string | null | undefined): SyncLogsLastResult | null {
  if (value && KNOWN_ENGINE_STATUS.has(value)) return value as SyncLogsLastResult;
  return null;
}

/**
 * Last sync result from indexing-status, then the newest attempt if status is missing.
 */
export function lastResultFromRow(row: ConnectorTableRow, latestStatus?: string | null): SyncLogsLastResult {
  if (row.inProgress || row.lastStatus === "in_progress" || latestStatus === "in_progress") return "in_progress";
  if (row.lastStatus === "not_started" || latestStatus === "not_started") return "not_started";
  return (
    coerceEngineStatus(row.lastStatus) ??
    coerceEngineStatus(row.lastFinishedStatus) ??
    coerceEngineStatus(latestStatus) ??
    "pending"
  );
}

/**
 * True when the drawer should keep polling StaffLess.
 * Queued (not_started) and in_progress both count; a missing first sync does not.
 */
export function shouldPollSyncLogs(summary: SyncLogsSummary): boolean {
  return summary.inProgress || summary.lastResult === "in_progress" || summary.lastResult === "not_started";
}

function latestAttemptDocs(row: ConnectorTableRow, latest: StafflessIndexAttempt | null): number | null {
  if (row.latestAttemptDocsIndexed != null) return row.latestAttemptDocsIndexed;
  return latest ? latest.totalDocsIndexed : null;
}

/**
 * Build the sync-logs payload. Callers must already have a bound cc-pair.
 * @returns Combined view. Does not invent records-found or fetched counts.
 */
export function buildSyncLogsView(input: {
  connector: ConnectorTableRow;
  attempts: { items: StafflessIndexAttempt[]; total: number };
  errors: { items: StafflessIndexError[]; total: number };
}): SyncLogsView {
  const latest = input.attempts.items[0] ?? null;
  const latestStatus = latest?.status ?? null;
  const running =
    input.connector.inProgress ||
    input.connector.lastStatus === "in_progress" ||
    input.connector.lastStatus === "not_started" ||
    latestStatus === "in_progress" ||
    latestStatus === "not_started";
  const lastError = latest?.errorMsg ?? input.errors.items[0]?.failureMessage ?? null;

  return {
    connector: input.connector,
    summary: {
      docsIndexed: input.connector.docsIndexed,
      latestAttemptDocsIndexed: latestAttemptDocs(input.connector, latest),
      newDocsIndexed: latest ? latest.newDocsIndexed : null,
      inProgress: running,
      lastSyncAt: input.connector.lastSyncedAt,
      lastResult: lastResultFromRow(input.connector, latestStatus),
      errorCount: input.errors.total,
      lastError,
    },
    attempts: input.attempts.items,
    attemptsTotal: input.attempts.total,
    errors: input.errors.items,
    errorsTotal: input.errors.total,
  };
}
