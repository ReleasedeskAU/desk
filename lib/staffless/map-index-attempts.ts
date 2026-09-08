/**
 * Strip StaffLess index-attempt payloads before they reach the browser.
 * Never forward stack traces or raw exception bodies.
 */

export type StafflessIndexAttempt = {
  id: number;
  status: string | null;
  fromBeginning: boolean;
  newDocsIndexed: number;
  totalDocsIndexed: number;
  docsRemoved: number;
  errorMsg: string | null;
  errorCount: number;
  timeStarted: string | null;
  timeUpdated: string | null;
};

export type StafflessIndexError = {
  id: number;
  failureMessage: string;
  isResolved: boolean;
  timeCreated: string | null;
  documentId: string | null;
};

type RawAttempt = {
  id?: unknown;
  status?: unknown;
  from_beginning?: unknown;
  new_docs_indexed?: unknown;
  total_docs_indexed?: unknown;
  docs_removed_from_index?: unknown;
  error_msg?: unknown;
  error_count?: unknown;
  time_started?: unknown;
  time_updated?: unknown;
};

type RawError = {
  id?: unknown;
  failure_message?: unknown;
  is_resolved?: unknown;
  time_created?: unknown;
  document_id?: unknown;
};

function asInt(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Keep the first useful sentence and drop stack traces.
 * Index attempts store a short error_msg plus a separate full_exception_trace.
 */
export function plainIndexErrorMessage(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const stripped = raw
    .replace(/Traceback \(most recent call last\):[\s\S]*/i, "")
    .replace(/(?:\n|^)\s*at\s+\S.+/g, "")
    .trim();
  const line = (stripped || raw.trim()).split("\n")[0]?.trim() ?? "";
  if (!line) return "Index run failed";
  return line.length > 300 ? `${line.slice(0, 297)}…` : line;
}

/**
 * Map one StaffLess index attempt. Drops `full_exception_trace`.
 */
export function mapIndexAttempt(raw: unknown): StafflessIndexAttempt | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as RawAttempt;
  const id = asInt(row.id, 0);
  if (id <= 0) return null;
  return {
    id,
    status: asString(row.status),
    fromBeginning: row.from_beginning === true,
    newDocsIndexed: asInt(row.new_docs_indexed),
    totalDocsIndexed: asInt(row.total_docs_indexed),
    docsRemoved: asInt(row.docs_removed_from_index),
    errorMsg: plainIndexErrorMessage(asString(row.error_msg)),
    errorCount: asInt(row.error_count),
    timeStarted: asString(row.time_started),
    timeUpdated: asString(row.time_updated),
  };
}

/**
 * Map paginated StaffLess index attempts. Unknown items are skipped.
 */
export function mapIndexAttemptPage(payload: unknown): { items: StafflessIndexAttempt[]; total: number } {
  const body = payload && typeof payload === "object" ? (payload as { items?: unknown; total_items?: unknown }) : {};
  const items = Array.isArray(body.items) ? body.items.map(mapIndexAttempt).filter((v): v is StafflessIndexAttempt => v != null) : [];
  return { items, total: asInt(body.total_items, items.length) };
}

/**
 * Map one StaffLess index error. Keeps the failure message, not internals.
 */
export function mapIndexError(raw: unknown): StafflessIndexError | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as RawError;
  const id = asInt(row.id, 0);
  const failureMessage = plainIndexErrorMessage(asString(row.failure_message));
  if (id <= 0 || !failureMessage) return null;
  return {
    id,
    failureMessage,
    isResolved: row.is_resolved === true,
    timeCreated: asString(row.time_created),
    documentId: asString(row.document_id),
  };
}

/**
 * Map paginated StaffLess index errors.
 */
export function mapIndexErrorPage(payload: unknown): { items: StafflessIndexError[]; total: number } {
  const body = payload && typeof payload === "object" ? (payload as { items?: unknown; total_items?: unknown }) : {};
  const items = Array.isArray(body.items) ? body.items.map(mapIndexError).filter((v): v is StafflessIndexError => v != null) : [];
  return { items, total: asInt(body.total_items, items.length) };
}
