/**
 * Allowed Environment Conflict Type values.
 * Existing three plus the sheet’s Environment Booking / Maintenance Window /
 * Freeze Period. Leftover seed strings stay valid on existing rows.
 */

export const CONFLICT_TYPES = [
  "Schedule",
  "Resource",
  "Application",
  "Environment Booking",
  "Maintenance Window",
  "Freeze Period",
] as const;

export type ConflictType = (typeof CONFLICT_TYPES)[number];

export const LEGACY_CONFLICT_TYPES = [
  "Same Test/UAT env required",
  "Same UAT env required",
  "Overlapping Test/UAT window",
  "UAT environment overlap",
] as const;

export const CONFLICT_TYPES_ACCEPTED = [
  ...CONFLICT_TYPES,
  ...LEGACY_CONFLICT_TYPES,
] as const;

const ACCEPTED_SET = new Set<string>(CONFLICT_TYPES_ACCEPTED);

/**
 * Whether a raw type string is in the agreed catalog (including leftovers).
 * @param value - User/API-supplied type
 */
export function isConflictType(value: unknown): value is string {
  return typeof value === "string" && ACCEPTED_SET.has(value);
}

/**
 * True when the stored type is a leftover from the previous seed list.
 * @param value - Stored type label
 */
export function isLegacyConflictType(value: string): boolean {
  return (LEGACY_CONFLICT_TYPES as readonly string[]).includes(value.trim());
}

/**
 * Select options for create/edit: sheet six, plus the current leftover value.
 * @param current - Stored type on the row being edited
 */
export function conflictTypeOptions(
  current?: string | null
): { value: string; label: string }[] {
  const options = CONFLICT_TYPES.map((value) => ({ value, label: value }));
  const trimmed = current?.trim() ?? "";
  if (trimmed && !ACCEPTED_SET.has(trimmed)) {
    options.push({ value: trimmed, label: `${trimmed} (current)` });
  } else if (trimmed && isLegacyConflictType(trimmed)) {
    options.push({ value: trimmed, label: `${trimmed} (current)` });
  }
  return options;
}
