/**
 * Generic field-lock enforcement. Status transitions stay on the lifecycle engine.
 * Unknown / missing status keys fail closed (locked).
 */
import { BLOCKER_FIELD_LOCK_CATALOG } from "@/lib/blocker-field-lock-catalog";
import {
  catalogEntryForEntityBodyKey,
  type EntityFieldLockCatalogEntry,
  type EntityFieldLockType,
  type FieldLockState,
} from "@/lib/entity-field-lock";
import {
  defaultEntityFieldLockRows,
  loadEntityFieldLockConfig,
  type EntityFieldLockRow,
} from "@/lib/entity-field-lock-config-db";
import { createDefaultBlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config";
import { resolveBlockerLifecycleStatusRef } from "@/lib/blocker-lifecycle-transition";

export type EntityFieldLockRejection = { field: string; reason: string };

export type ValidateEntityFieldUpdateResult = {
  allowed: boolean;
  rejected: EntityFieldLockRejection[];
};

const CATALOG_BY_TYPE: Record<
  EntityFieldLockType,
  readonly EntityFieldLockCatalogEntry[]
> = {
  blocker: BLOCKER_FIELD_LOCK_CATALOG,
};

function catalogFor(
  entityType: EntityFieldLockType
): readonly EntityFieldLockCatalogEntry[] {
  return CATALOG_BY_TYPE[entityType];
}

function stateAtStatus(
  row: EntityFieldLockRow,
  statusKey: string
): FieldLockState {
  return row.statusRules[statusKey] ?? "locked";
}

/**
 * Lock state for one matrix field at a live status key.
 */
export function getEntityFieldLockStateFromRows(
  rows: EntityFieldLockRow[],
  fieldKey: string,
  currentStatusKey: string
): FieldLockState {
  const row = rows.find((r) => r.fieldKey === fieldKey);
  if (!row) return "locked";
  return stateAtStatus(row, currentStatusKey);
}

function labelForStatus(
  entityType: EntityFieldLockType,
  statusKey: string
): string {
  if (entityType === "blocker") {
    const match = createDefaultBlockerLifecycleConfig().statuses.find(
      (s) => s.key === statusKey
    );
    if (match) return match.label;
  }
  return statusKey
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function nounFor(entityType: EntityFieldLockType): string {
  return entityType === "blocker" ? "blocker" : entityType;
}

/**
 * Pure validation against an in-memory matrix.
 */
export function validateEntityFieldUpdateWithRows(
  entityType: EntityFieldLockType,
  rows: EntityFieldLockRow[],
  currentStatusKey: string,
  changedFields: string[],
  statusLabel = labelForStatus(entityType, currentStatusKey)
): ValidateEntityFieldUpdateResult {
  const rejected: EntityFieldLockRejection[] = [];
  const seen = new Set<string>();
  const catalog = catalogFor(entityType);

  for (const bodyKey of changedFields) {
    if (bodyKey === "status" || bodyKey === "overrideReason" || bodyKey === "statusKey") {
      continue;
    }
    const entry = catalogEntryForEntityBodyKey(catalog, bodyKey);
    if (!entry || entry.infoOnly) continue;
    if (seen.has(entry.fieldKey)) continue;
    seen.add(entry.fieldKey);

    const state = getEntityFieldLockStateFromRows(
      rows,
      entry.fieldKey,
      currentStatusKey
    );
    if (state === "locked") {
      rejected.push({
        field: entry.fieldKey,
        reason: `“${entry.label}” can’t be changed while this ${nounFor(entityType)} is ${statusLabel}.`,
      });
    }
  }

  return { allowed: rejected.length === 0, rejected };
}

function resolveLiveStatusKey(
  currentStatus: string,
  liveStatuses: readonly { key: string; label: string }[]
): string {
  const trimmed = currentStatus.trim();
  if (!trimmed) return trimmed;
  const byKey = liveStatuses.find((s) => s.key === trimmed);
  if (byKey) return byKey.key;
  const lower = trimmed.toLocaleLowerCase();
  const byLabel = liveStatuses.find(
    (s) => s.label.toLocaleLowerCase() === lower
  );
  if (byLabel) return byLabel.key;
  return (
    resolveBlockerLifecycleStatusRef(
      createDefaultBlockerLifecycleConfig(),
      trimmed
    )?.key ?? trimmed.toLowerCase().replace(/\s+/g, "_")
  );
}

/**
 * Validate proposed field changes against the caller’s live matrix.
 */
export async function validateEntityFieldUpdate(args: {
  clerkUserId: string;
  entityType: EntityFieldLockType;
  currentStatus: string;
  changedFields: string[];
}): Promise<ValidateEntityFieldUpdateResult> {
  const { clerkUserId, entityType, currentStatus, changedFields } = args;
  try {
    const loaded = await loadEntityFieldLockConfig(clerkUserId, entityType);
    const statusKey = resolveLiveStatusKey(currentStatus, loaded.statuses);
    const statusLabel =
      loaded.statuses.find((s) => s.key === statusKey)?.label ??
      labelForStatus(entityType, statusKey);
    return validateEntityFieldUpdateWithRows(
      entityType,
      loaded.rows,
      statusKey,
      changedFields,
      statusLabel
    );
  } catch (err) {
    console.warn(
      `[entity-field-lock] validate failed; using catalog defaults: ${
        err instanceof Error ? err.message.replace(/\s+/g, " ").slice(0, 200) : "unknown"
      }`
    );
    const rows = defaultEntityFieldLockRows(entityType);
    const fallbackStatuses =
      entityType === "blocker"
        ? createDefaultBlockerLifecycleConfig().statuses
        : [];
    const statusKey = resolveLiveStatusKey(currentStatus, fallbackStatuses);
    return validateEntityFieldUpdateWithRows(
      entityType,
      rows,
      statusKey,
      changedFields
    );
  }
}

/** Blocker-specific wrapper — same engine, typed for write paths. */
export async function validateBlockerFieldUpdate(
  clerkUserId: string,
  currentStatus: string,
  changedFields: string[]
): Promise<ValidateEntityFieldUpdateResult> {
  return validateEntityFieldUpdate({
    clerkUserId,
    entityType: "blocker",
    currentStatus,
    changedFields,
  });
}
