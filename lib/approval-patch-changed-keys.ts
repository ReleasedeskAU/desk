/**
 * Decide which PATCH body keys actually change the stored Approval.
 * Full-form saves must not let echoed fields mask decision-transition errors.
 */

const DATE_KEYS = new Set(["submittedDate", "decisionDate"]);

const META_KEYS = new Set(["id", "overrideReason"]);

function dateOnlyIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value).trim() || null;
  return d.toISOString().slice(0, 10);
}

function scalarKey(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (value instanceof Date) return dateOnlyIso(value);
  const s = String(value).trim();
  return s === "" ? null : s;
}

/**
 * Keys on `body` whose values differ from the current Approval row.
 * `decision` is always kept when present so the transition engine still runs.
 *
 * @param existing - Stored approval scalars
 * @param body - Incoming PATCH JSON
 */
export function keysWithActualApprovalPatchChanges(args: {
  existing: Record<string, unknown>;
  body: Record<string, unknown>;
}): string[] {
  const changed: string[] = [];
  for (const [key, incoming] of Object.entries(args.body)) {
    if (incoming === undefined) continue;
    if (META_KEYS.has(key)) continue;
    if (key === "decision") {
      changed.push(key);
      continue;
    }
    if (DATE_KEYS.has(key)) {
      if (dateOnlyIso(incoming) !== dateOnlyIso(args.existing[key])) {
        changed.push(key);
      }
      continue;
    }
    if (scalarKey(incoming) !== scalarKey(args.existing[key])) {
      changed.push(key);
    }
  }
  return changed;
}
