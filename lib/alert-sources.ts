/**
 * Where an alert came from (sheet’s 8 sources). Separate from alertType
 * (Reminder / Warning / Escalation / Notification), which is urgency/nature.
 */

export const ALERT_SOURCES = [
  "Schedule",
  "Approval Pending",
  "Environment",
  "Conflict",
  "Risk Threshold",
  "Dependency",
  "Manual",
  "System",
] as const;

export type AlertSource = (typeof ALERT_SOURCES)[number];

const ACCEPTED = new Set<string>(ALERT_SOURCES);

/**
 * Whether a raw source string is in the sheet catalog.
 * @param value - User/API-supplied source
 */
export function isAlertSource(value: unknown): value is AlertSource {
  return typeof value === "string" && ACCEPTED.has(value);
}

/**
 * Select options for create/edit, plus the current leftover value if unknown.
 * @param current - Stored source on the row being edited
 */
export function alertSourceOptions(
  current?: string | null
): { value: string; label: string }[] {
  const options = ALERT_SOURCES.map((value) => ({ value, label: value }));
  const trimmed = current?.trim() ?? "";
  if (trimmed && !ACCEPTED.has(trimmed)) {
    options.push({ value: trimmed, label: `${trimmed} (current)` });
  }
  return options;
}
