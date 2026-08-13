/**
 * Decide which PATCH body keys actually change the stored Blocker.
 * Full-form saves must not let echoed fields mask status-transition errors.
 */

const DATE_KEYS = new Set([
  "raisedDate",
  "targetResolutionDate",
  "actualResolutionDate",
]);

const META_KEYS = new Set(["id", "overrideReason"]);

/** Body key → stored Prisma / mapBlocker field. */
const BODY_TO_STORED: Record<string, string> = {
  department: "departmentName",
  application: "applicationName",
};

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
 * Keys on `body` whose values differ from the current Blocker row.
 * `status` is always kept when present so the transition engine still runs.
 *
 * @param existing - Stored blocker scalars (Prisma field names plus mapped aliases)
 * @param body - Incoming PATCH JSON
 */
export function keysWithActualBlockerPatchChanges(args: {
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
    const storedKey = BODY_TO_STORED[key] ?? key;
    if (DATE_KEYS.has(key)) {
      if (dateOnlyIso(incoming) !== dateOnlyIso(args.existing[storedKey])) {
        changed.push(key);
      }
      continue;
    }
    if (scalarKey(incoming) !== scalarKey(args.existing[storedKey])) {
      changed.push(key);
    }
  }
  return changed;
}
