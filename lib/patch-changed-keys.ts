/**
 * Shared PATCH “actual change” detection for lifecycle entities.
 * Full-form detail saves echo unchanged fields; edit policy / locks must only
 * see real edits or status transitions get masked (same class as Release Owner
 * / programProject bugs).
 */

export type PatchChangedKeysOptions = {
  existing: Record<string, unknown>;
  body: Record<string, unknown>;
  /** Keys that always count when present (status / decision). */
  alwaysKeep?: ReadonlySet<string>;
  dateKeys?: ReadonlySet<string>;
  metaKeys?: ReadonlySet<string>;
  /** Map request key → stored column name on `existing`. */
  bodyToStored?: Readonly<Record<string, string>>;
  /**
   * Request-only keys with no stored column (e.g. risk `applicationId`).
   * Skipped here — callers must resolve them to stored fields before compare,
   * or handle separately.
   */
  ignoreKeys?: ReadonlySet<string>;
};

function dateOnlyIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value).trim() || null;
  return d.toISOString().slice(0, 10);
}

/**
 * Normalize a scalar for equality (trim; empty → null).
 * @param value - Incoming or stored value
 */
export function patchScalarKey(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (value instanceof Date) return dateOnlyIso(value);
  const s = String(value).trim();
  return s === "" ? null : s;
}

/**
 * Body keys whose values differ from the stored row.
 *
 * @param args - Compare inputs and key sets
 * @returns Changed body keys (plus always-keep keys when present)
 */
export function keysWithActualPatchChanges(
  args: PatchChangedKeysOptions
): string[] {
  const alwaysKeep = args.alwaysKeep ?? new Set(["status"]);
  const dateKeys = args.dateKeys ?? new Set<string>();
  const metaKeys = args.metaKeys ?? new Set(["id", "overrideReason"]);
  const bodyToStored = args.bodyToStored ?? {};
  const ignoreKeys = args.ignoreKeys ?? new Set<string>();
  const changed: string[] = [];

  for (const [key, incoming] of Object.entries(args.body)) {
    if (incoming === undefined) continue;
    if (metaKeys.has(key) || ignoreKeys.has(key)) continue;
    if (alwaysKeep.has(key)) {
      changed.push(key);
      continue;
    }
    // bodyToStored aliases (e.g. application → applicationName); missing stored
    // values compare as null so new notes/dates still count as edits.
    const storedKey = bodyToStored[key] ?? key;
    if (dateKeys.has(key) || dateKeys.has(storedKey)) {
      if (dateOnlyIso(incoming) !== dateOnlyIso(args.existing[storedKey])) {
        changed.push(key);
      }
      continue;
    }
    if (patchScalarKey(incoming) !== patchScalarKey(args.existing[storedKey])) {
      changed.push(key);
    }
  }
  return changed;
}
