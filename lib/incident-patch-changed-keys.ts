/**
 * Decide which PATCH body keys actually change the stored Incident.
 * Full-form saves must not let echoed fields mask status-transition errors.
 */

const DATE_KEYS = new Set(["timestamp"]);

const META_KEYS = new Set(["id", "overrideReason"]);

function dateTimeKey(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value).trim() || null;
  return d.toISOString();
}

function scalarKey(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (value instanceof Date) return dateTimeKey(value);
  const s = String(value).trim();
  return s === "" ? null : s;
}

/**
 * Keys on `body` whose values differ from the current Incident row.
 * `status` is always kept when present so the transition engine still runs.
 *
 * @param existing - Stored incident scalars
 * @param body - Incoming PATCH JSON
 */
export function keysWithActualIncidentPatchChanges(args: {
  existing: Record<string, unknown>;
  body: Record<string, unknown>;
}): string[] {
  const changed: string[] = [];
  for (const [key, incoming] of Object.entries(args.body)) {
    if (incoming === undefined) continue;
    if (META_KEYS.has(key)) continue;
    if (key === "status") {
      changed.push(key);
      continue;
    }
    if (DATE_KEYS.has(key)) {
      if (dateTimeKey(incoming) !== dateTimeKey(args.existing[key])) {
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
