/**
 * Decide which PATCH body keys actually change the stored Release.
 *
 * The Edit Release modal sends the full form, including unchanged identity
 * fields. Field locks and edit policy must only see real edits — otherwise
 * always-locked keys like releaseCode mask status-transition errors.
 */

import { normalizeProgramProject } from "@/lib/release-id";

const DATE_KEYS = new Set([
  "releaseDate",
  "cabDate",
  "startDate",
  "goLiveDate",
  "deployDate",
]);

/** Request-only keys that never represent a stored-field edit. */
const META_KEYS = new Set([
  "id",
  "overrideReason",
  "previousStatus",
  "supersedeSignoffFields",
]);

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

function sortedIdList(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim())
    .sort()
    .join("\0");
}

/**
 * Keys on `body` whose values differ from the current Release row.
 *
 * @param existing - Stored Release scalars
 * @param body - Incoming PATCH JSON
 * @param currentApplicationIds - Linked application ids (when body includes them)
 * @param currentDependsOnReleaseIds - Linked dependency ids (when body includes them)
 * @param currentStakeholderIds - Linked stakeholder ids (when body includes them)
 * @returns Body keys that are actual edits (plus `status` even when unchanged — caller may send it)
 */
export function keysWithActualReleasePatchChanges(args: {
  existing: Record<string, unknown>;
  body: Record<string, unknown>;
  currentApplicationIds?: readonly string[];
  currentDependsOnReleaseIds?: readonly string[];
  currentStakeholderIds?: readonly string[];
}): string[] {
  const changed: string[] = [];
  for (const [key, incoming] of Object.entries(args.body)) {
    if (incoming === undefined) continue;
    if (META_KEYS.has(key)) continue;
    // Status is evaluated by the transition engine, not field locks — keep it
    // when present so callers that only send status still run enforcement.
    if (key === "status") {
      changed.push(key);
      continue;
    }
    if (DATE_KEYS.has(key)) {
      if (dateOnlyIso(incoming) !== dateOnlyIso(args.existing[key])) {
        changed.push(key);
      }
      continue;
    }
    if (key === "applicationIds") {
      if (
        sortedIdList(incoming) !==
        sortedIdList(args.currentApplicationIds ?? [])
      ) {
        changed.push(key);
      }
      continue;
    }
    if (key === "dependsOnReleaseIds") {
      if (
        sortedIdList(incoming) !==
        sortedIdList(args.currentDependsOnReleaseIds ?? [])
      ) {
        changed.push(key);
      }
      continue;
    }
    if (key === "stakeholderIds") {
      if (
        sortedIdList(incoming) !==
        sortedIdList(args.currentStakeholderIds ?? [])
      ) {
        changed.push(key);
      }
      continue;
    }
    // Empty / null / "n/a" all normalize to "N/A" on save — not a real edit.
    if (key === "programProject") {
      const next =
        normalizeProgramProject(String(incoming ?? "")) ?? "N/A";
      const prev =
        normalizeProgramProject(String(args.existing[key] ?? "")) ?? "N/A";
      if (next !== prev) changed.push(key);
      continue;
    }
    if (scalarKey(incoming) !== scalarKey(args.existing[key])) {
      changed.push(key);
    }
  }
  // `owner` is a denormalized label of releaseOwnerId. Edit Release always
  // rewrites it from the user picker ("USR-061 — Name" → "Name"), which looks
  // like an owner edit and trips Field Locks while Blocked — masking a status
  // change. Ignore owner churn unless the FK actually changed.
  let next = changed;
  if (next.includes("owner") && !next.includes("releaseOwnerId")) {
    next = next.filter((key) => key !== "owner");
  }
  // Status-only moves must not be blocked by locked ownership fields. If the
  // client still echoes a different releaseOwnerId (missing prefill / null vs
  // id), drop it when status is also changing — real owner edits omit status
  // or change both deliberately from the Owner control.
  if (
    next.includes("status") &&
    next.includes("releaseOwnerId") &&
    next.filter((key) => key !== "status" && key !== "owner" && key !== "releaseOwnerId")
      .length === 0
  ) {
    next = next.filter((key) => key !== "releaseOwnerId" && key !== "owner");
  }
  return next;
}
