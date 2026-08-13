/**
 * Release field-lock enforcement against the live per-user matrix.
 * Status transitions remain owned by the lifecycle transition engine (info-only row).
 */
import {
  catalogEntryForBodyKey,
  type FieldLockState,
} from "@/lib/release-field-lock-catalog";
import {
  defaultFieldLockRowsFromCatalog,
  loadReleaseFieldLockConfig,
  type ReleaseFieldLockRow,
} from "@/lib/release-field-lock-config-db";
import { createDefaultReleaseLifecycleConfig, DEFAULT_RELEASE_LIFECYCLE_STATUSES } from "@/lib/release-lifecycle-config";
import { resolveLifecycleStatusRef } from "@/lib/release-lifecycle-transition";

export type FieldLockRejection = { field: string; reason: string };
export type FieldLockSideEffect = {
  field: string;
  effect: "revert_to_pending_cab";
};

export type ValidateReleaseFieldUpdateResult = {
  allowed: boolean;
  rejected: FieldLockRejection[];
  sideEffects: FieldLockSideEffect[];
};

/** Display label for a status key in lock-denial copy. */
function statusLabelForLockKey(key: string): string {
  const match = DEFAULT_RELEASE_LIFECYCLE_STATUSES.find((s) => s.key === key);
  if (match) return match.label;
  return key
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function stateAtStatus(
  row: ReleaseFieldLockRow,
  statusKey: string
): FieldLockState {
  const state = row.statusRules[statusKey];
  // Missing / orphan status key → fail closed to locked (prompt requirement).
  return state ?? "locked";
}

/**
 * Resolve lock state for one matrix field at a status key.
 * @param rows - Loaded matrix rows.
 * @param fieldKey - Catalog fieldKey.
 * @param currentStatusKey - Live lifecycle status key.
 */
export function getFieldLockStateFromRows(
  rows: ReleaseFieldLockRow[],
  fieldKey: string,
  currentStatusKey: string
): FieldLockState {
  const row = rows.find((r) => r.fieldKey === fieldKey);
  if (!row) return "locked";
  return stateAtStatus(row, currentStatusKey);
}

/**
 * Load matrix and return lock state for a field (fail-soft to catalog defaults).
 * @param clerkUserId - Session scope.
 * @param fieldKey - Catalog key.
 * @param currentStatusKey - Status key (not label).
 */
export async function getFieldLockState(
  clerkUserId: string,
  fieldKey: string,
  currentStatusKey: string
): Promise<FieldLockState> {
  try {
    const loaded = await loadReleaseFieldLockConfig(clerkUserId);
    return getFieldLockStateFromRows(loaded.rows, fieldKey, currentStatusKey);
  } catch (err) {
    console.warn(
      `[release-field-lock] getFieldLockState failed; using catalog defaults: ${
        err instanceof Error ? err.message.replace(/\s+/g, " ").slice(0, 200) : "unknown"
      }`
    );
    const rows = defaultFieldLockRowsFromCatalog(
      createDefaultReleaseLifecycleConfig()
    );
    return getFieldLockStateFromRows(rows, fieldKey, currentStatusKey);
  }
}

/**
 * Validate proposed Release field changes against the field-lock matrix.
 * Does not evaluate `status` (lifecycle transition engine owns status).
 *
 * @param clerkUserId - Session scope.
 * @param currentStatus - Release.status label or key.
 * @param changedFields - Body keys present on the write (with defined values).
 */
export async function validateReleaseFieldUpdate(
  clerkUserId: string,
  currentStatus: string,
  changedFields: string[]
): Promise<ValidateReleaseFieldUpdateResult> {
  let rows: ReleaseFieldLockRow[];
  let statusKey: string;

  try {
    const loaded = await loadReleaseFieldLockConfig(clerkUserId);
    rows = loaded.rows;
    const resolved = resolveLifecycleStatusRef(
      loaded.lifecycleConfig,
      currentStatus
    );
    statusKey = resolved?.key ?? currentStatus.trim().toLowerCase().replace(/\s+/g, "_");
  } catch (err) {
    console.warn(
      `[release-field-lock] validateReleaseFieldUpdate load failed; using catalog defaults: ${
        err instanceof Error ? err.message.replace(/\s+/g, " ").slice(0, 200) : "unknown"
      }`
    );
    const lifecycle = createDefaultReleaseLifecycleConfig();
    rows = defaultFieldLockRowsFromCatalog(lifecycle);
    const resolved = resolveLifecycleStatusRef(lifecycle, currentStatus);
    statusKey = resolved?.key ?? currentStatus.trim().toLowerCase().replace(/\s+/g, "_");
  }

  return validateReleaseFieldUpdateWithRows(rows, statusKey, changedFields);
}

/**
 * Pure validation against an in-memory matrix (unit tests).
 */
export function validateReleaseFieldUpdateWithRows(
  rows: ReleaseFieldLockRow[],
  currentStatusKey: string,
  changedFields: string[]
): ValidateReleaseFieldUpdateResult {
  const rejected: FieldLockRejection[] = [];
  const sideEffects: FieldLockSideEffect[] = [];
  const seenFieldKeys = new Set<string>();

  for (const bodyKey of changedFields) {
    if (
      bodyKey === "status" ||
      bodyKey === "overrideReason" ||
      bodyKey === "previousStatus"
    ) {
      continue;
    }
    const entry = catalogEntryForBodyKey(bodyKey);
    if (!entry || entry.infoOnly) continue;
    if (seenFieldKeys.has(entry.fieldKey)) continue;
    seenFieldKeys.add(entry.fieldKey);

    const state = getFieldLockStateFromRows(
      rows,
      entry.fieldKey,
      currentStatusKey
    );
    if (state === "locked") {
      rejected.push({
        field: entry.fieldKey,
        reason: `"${entry.label}" can’t be changed while this release is ${statusLabelForLockKey(currentStatusKey)}.`,
      });
    } else if (state === "editable_with_side_effect") {
      sideEffects.push({
        field: entry.fieldKey,
        effect: "revert_to_pending_cab",
      });
    }
  }

  return {
    allowed: rejected.length === 0,
    rejected,
    sideEffects,
  };
}
