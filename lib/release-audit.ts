/**
 * Build a human-readable Audit Trail detail for release field edits.
 * Compares the existing row against the patch payload and lists every changed field.
 *
 * @param existing - Current release row values before update.
 * @param next - Fields about to be written (only keys present are considered).
 * @returns Detail string for the audit event, or null when nothing changed.
 */
export function summarizeReleaseFieldEdits(
  existing: Record<string, unknown>,
  next: Record<string, unknown>
): string | null {
  const parts: string[] = [];

  for (const [key, nextValue] of Object.entries(next)) {
    const prevValue = existing[key];
    if (sameAuditValue(prevValue, nextValue)) continue;
    parts.push(`${humanizeField(key)}: ${formatAuditValue(prevValue)} → ${formatAuditValue(nextValue)}`);
  }

  return parts.length ? parts.join("; ") : null;
}

/**
 * Format a relation-list change (applications, stakeholders, dependencies) for the audit trail.
 *
 * @param label - Human label for the relation.
 * @param beforeIds - Previous id list.
 * @param afterIds - New id list.
 * @returns Detail fragment, or null when unchanged.
 */
export function summarizeIdListChange(
  label: string,
  beforeIds: string[],
  afterIds: string[]
): string | null {
  const before = [...new Set(beforeIds)].sort().join(",");
  const after = [...new Set(afterIds)].sort().join(",");
  if (before === after) return null;
  return `${label}: ${before || "(none)"} → ${after || "(none)"}`;
}

/**
 * Prefer display name for audit actor; fall back to email / userId.
 *
 * @param user - Authenticated session user fields.
 * @returns Non-empty actor label for releaseAuditEvent.actor.
 */
export function auditActorName(user: {
  name?: string | null;
  email?: string | null;
  userId?: string | null;
}): string {
  const name = (user.name ?? "").trim();
  if (name) return name;
  const email = (user.email ?? "").trim();
  if (email) return email;
  return (user.userId ?? "").trim() || "Unknown user";
}

function sameAuditValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : a == null || a === "" ? null : new Date(String(a)).getTime();
    const tb = b instanceof Date ? b.getTime() : b == null || b === "" ? null : new Date(String(b)).getTime();
    if (ta == null && tb == null) return true;
    return ta === tb;
  }
  if (typeof a === "boolean" || typeof b === "boolean") {
    return Boolean(a) === Boolean(b);
  }
  const sa = a == null || a === "" ? "" : String(a);
  const sb = b == null || b === "" ? "" : String(b);
  return sa === sb;
}

function formatAuditValue(value: unknown): string {
  if (value == null || value === "") return "(empty)";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function humanizeField(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
