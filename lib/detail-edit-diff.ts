/**
 * Field-level change detection for detail-page edit confirmations.
 */

export type FieldChange = {
  label: string;
  from: string;
  to: string;
};

function formatVal(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") {
    const t = value.trim();
    return t.length ? t : "—";
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return String(value);
}

/**
 * Compares before/after draft snapshots and returns labeled rows that changed.
 * Only keys present in `labels` are compared (primary IDs should be omitted).
 *
 * @param before - Snapshot when edit started.
 * @param after - Draft at save time.
 * @param labels - Map of draft keys to human-readable labels.
 * @returns Changed fields in label-map key order.
 */
export function diffDraftChanges<T extends Record<string, unknown>>(
  before: T,
  after: T,
  labels: Partial<Record<keyof T & string, string>>
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const key of Object.keys(labels) as (keyof T & string)[]) {
    const label = labels[key];
    if (!label) continue;
    const from = formatVal(before[key]);
    const to = formatVal(after[key]);
    if (from !== to) changes.push({ label, from, to });
  }
  return changes;
}
