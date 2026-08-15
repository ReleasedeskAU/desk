/**
 * Sheet vocabularies for Release checklist fields shown in Edit Release.
 * These are planning labels (not lifecycle status keys).
 */

export const RELEASE_PLAN_PROGRESS_OPTIONS = [
  "Not Started",
  "Draft",
  "Ready",
] as const;

export const RELEASE_APPROVAL_STATUS_OPTIONS = [
  "Not Submitted",
  "Pending",
  "CAB Approved",
  "On Hold",
] as const;

export const RELEASE_ROLLBACK_PLAN_OPTIONS = [
  "Not Started",
  "In Progress",
  "Ready",
  "At Risk",
] as const;

/**
 * Select options: known sheet values plus the current stored value if it is off-list.
 *
 * @param known - Canonical options.
 * @param current - Value currently on the release.
 * @returns Deduped labels in display order.
 */
export function selectOptionsWithCurrent(
  known: readonly string[],
  current?: string | null
): string[] {
  const out = [...known];
  const raw = (current ?? "").trim();
  if (raw && !out.some((v) => v.toLocaleLowerCase() === raw.toLocaleLowerCase())) {
    out.unshift(raw);
  }
  return out;
}
