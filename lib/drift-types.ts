/**
 * Sheet Drift Types (class of drift). Separate from free-text driftCategory
 * (specific detail such as "Database Version").
 */

export const DRIFT_TYPES = [
  "Infrastructure",
  "Configuration",
  "Data",
  "Integration",
  "Security",
  "Code",
] as const;

export type DriftType = (typeof DRIFT_TYPES)[number];

const ACCEPTED = new Set<string>(DRIFT_TYPES);

/**
 * Whether a raw type string is in the sheet catalog.
 * @param value - User/API-supplied type
 */
export function isDriftType(value: unknown): value is DriftType {
  return typeof value === "string" && ACCEPTED.has(value);
}

/**
 * Select options for create/edit, plus the current leftover value if unknown.
 * @param current - Stored type on the row being edited
 */
export function driftTypeOptions(
  current?: string | null
): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = DRIFT_TYPES.map(
    (value) => ({ value, label: value })
  );
  const trimmed = current?.trim() ?? "";
  if (trimmed && !ACCEPTED.has(trimmed)) {
    options.push({ value: trimmed, label: `${trimmed} (current)` });
  }
  return options;
}
