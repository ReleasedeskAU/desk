/**
 * Release Fields sheet helpers for create/edit (RD-154).
 * Duration is computed, not stored. Sign-off form labels follow the sheet
 * (Settings may still show tenant type names).
 */

/** Sheet Sign-Off row names — testers hunt these on the Release form. */
export const RELEASE_SHEET_SIGNOFF_LABELS = {
  devSignoff: "Dev Sign-Off",
  testSignoff: "Test Sign-Off",
  uatSignoff: "UAT Sign-Off",
  securityClearance: "Security Sign-Off",
  businessSignoff: "Business Sign-Off",
  opsSignoff: "Ops Sign-Off",
  dressRehearsal: "Dress Rehearsal",
} as const;

/**
 * Calendar-day span from start to end (same formula as Release detail Duration).
 * Not stored — sheet Duration (Days) is always locked.
 *
 * @param start - Start date (ISO or date input).
 * @param end - End / release date.
 * @returns Whole days, or null when either date is missing/invalid.
 */
export function durationDaysBetween(
  start?: string | Date | null,
  end?: string | Date | null
): number | null {
  if (!start || !end) return null;
  const a = start instanceof Date ? start : new Date(start);
  const b = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * Display string for Duration (Days). Always read-only in the UI.
 *
 * @param start - Start date.
 * @param end - End date.
 * @returns Label such as `12 days`, or `—`.
 */
export function durationDaysLabel(
  start?: string | Date | null,
  end?: string | Date | null
): string {
  const days = durationDaysBetween(start, end);
  if (days == null) return "—";
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Parse Deployment Checklist percent from a form/API value.
 *
 * @param raw - Number or string.
 * @returns Finite 0–100, null when blank, or an error string.
 */
export function parseGoLiveChecklistPercent(
  raw: unknown
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: null };
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) {
    return { ok: false, error: "Deployment Checklist must be a number from 0 to 100." };
  }
  if (n < 0 || n > 100) {
    return { ok: false, error: "Deployment Checklist must be between 0 and 100." };
  }
  return { ok: true, value: n };
}

/**
 * Format a stored instant for the always-locked audit fields.
 *
 * @param value - Date or ISO string.
 * @returns UTC `YYYY-MM-DD HH:MM`, or `—`.
 */
export function formatReleaseAuditInstant(
  value?: string | Date | null
): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}
