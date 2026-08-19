/**
 * Shared field-lock types for every entity matrix (Blocker first).
 * Status rules are keyed by live lifecycle status keys — never by display labels.
 */
import {
  FIELD_LOCK_STATES,
  isFieldLockState,
  type FieldLockState,
  type FieldLockStatusRules,
} from "@/lib/release-field-lock-catalog";

export { FIELD_LOCK_STATES, isFieldLockState };
export type { FieldLockState, FieldLockStatusRules };

/**
 * Entity types that can own a field-lock matrix.
 * Add the next 8 here as their catalogs land — do not hardcode status names.
 */
export const ENTITY_FIELD_LOCK_TYPES = ["blocker"] as const;
export type EntityFieldLockType = (typeof ENTITY_FIELD_LOCK_TYPES)[number];

export type EntityFieldLockCatalogEntry = {
  fieldKey: string;
  label: string;
  category: string;
  lockRuleRef: string | null;
  isConfigurable: boolean;
  bodyKeys?: readonly string[];
  infoOnly?: boolean;
  unavailable?: boolean;
  /** Default rules keyed by that entity’s enterprise-default status keys. */
  defaultRules: FieldLockStatusRules;
};

/**
 * Whether `value` is a known entity-lock type.
 */
export function isEntityFieldLockType(
  value: unknown
): value is EntityFieldLockType {
  return (
    typeof value === "string" &&
    (ENTITY_FIELD_LOCK_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Build statusRules: `editable` on listed keys, `locked` on every other live key.
 *
 * @param allKeys - Live (or default) status keys for this entity.
 * @param editableKeys - Keys that stay editable.
 */
export function fieldLockRules(
  allKeys: readonly string[],
  editableKeys: readonly string[]
): FieldLockStatusRules {
  const editable = new Set(editableKeys);
  const out: FieldLockStatusRules = {};
  for (const key of allKeys) {
    out[key] = editable.has(key) ? "editable" : "locked";
  }
  return out;
}

/**
 * All-locked rules for identity / audit rows.
 */
export function fieldLockAlwaysLocked(
  allKeys: readonly string[]
): FieldLockStatusRules {
  const out: FieldLockStatusRules = {};
  for (const key of allKeys) out[key] = "locked";
  return out;
}

/**
 * Remap catalog defaults onto the caller’s live status keys (same key, else same label).
 */
export function remapFieldLockRulesToLiveKeys(
  defaultRules: FieldLockStatusRules,
  liveStatuses: readonly { key: string; label: string }[],
  defaultKeyToLabel: Readonly<Record<string, string>>
): FieldLockStatusRules {
  const liveKeys = new Set(liveStatuses.map((s) => s.key));
  const labelToLiveKey = new Map(
    liveStatuses.map((s) => [s.label.toLocaleLowerCase(), s.key])
  );
  const out: FieldLockStatusRules = {};
  for (const [defaultKey, state] of Object.entries(defaultRules)) {
    if (liveKeys.has(defaultKey)) {
      out[defaultKey] = state;
      continue;
    }
    const label = defaultKeyToLabel[defaultKey];
    if (!label) continue;
    const liveKey = labelToLiveKey.get(label.toLocaleLowerCase());
    if (liveKey) out[liveKey] = state;
  }
  return out;
}

/**
 * Which catalog row owns a PATCH/create body key.
 */
export function catalogEntryForEntityBodyKey(
  catalog: readonly EntityFieldLockCatalogEntry[],
  bodyKey: string
): EntityFieldLockCatalogEntry | null {
  for (const entry of catalog) {
    if (entry.infoOnly || entry.unavailable) continue;
    const keys = entry.bodyKeys ?? [entry.fieldKey];
    if (keys.includes(bodyKey)) return entry;
  }
  return null;
}
