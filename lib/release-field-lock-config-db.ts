/**
 * Persistence for per-user Release field-lock matrix (live/latest, no version pin).
 */
import { randomUUID } from "node:crypto";
import type { Prisma } from "@releasedesk/database";
import { prisma, withDbRetry } from "@/lib/prisma";
import {
  RELEASE_FIELD_LOCK_CATALOG,
  isFieldLockState,
  type FieldLockState,
  type FieldLockStatusRules,
} from "@/lib/release-field-lock-catalog";
import { loadReleaseLifecycleConfig } from "@/lib/release-lifecycle-config-db";
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";

export type ReleaseFieldLockRow = {
  fieldKey: string;
  category: string;
  lockRuleRef: string | null;
  isConfigurable: boolean;
  statusRules: FieldLockStatusRules;
};

export type LoadedReleaseFieldLockConfig = {
  rows: ReleaseFieldLockRow[];
  /** Status keys present in rules but missing from live lifecycle config. */
  orphanStatusKeys: string[];
  lifecycleConfig: ReleaseLifecycleConfig;
};

async function ensureFieldLockTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserReleaseFieldLockConfig" (
      "id" TEXT NOT NULL,
      "clerkUserId" TEXT NOT NULL,
      "organizationId" TEXT,
      "fieldKey" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "lockRuleRef" TEXT,
      "isConfigurable" BOOLEAN NOT NULL DEFAULT true,
      "statusRules" JSONB NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "UserReleaseFieldLockConfig_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UserReleaseFieldLockConfig_clerkUserId_fieldKey_key"
      ON "UserReleaseFieldLockConfig"("clerkUserId", "fieldKey")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserReleaseFieldLockConfig_clerkUserId_idx"
      ON "UserReleaseFieldLockConfig"("clerkUserId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserReleaseFieldLockConfig_organizationId_idx"
      ON "UserReleaseFieldLockConfig"("organizationId")
  `);
}

function parseStatusRules(raw: unknown): FieldLockStatusRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: FieldLockStatusRules = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isFieldLockState(value)) out[key] = value;
  }
  return out;
}

/**
 * Remap default rules (keyed by enterprise default status keys) onto the
 * caller's live status keys by matching default labels → live keys.
 */
export function remapDefaultRulesToLiveKeys(
  defaultRules: FieldLockStatusRules,
  lifecycle: ReleaseLifecycleConfig
): FieldLockStatusRules {
  const labelToLiveKey = new Map(
    lifecycle.statuses.map((s) => [s.label.toLocaleLowerCase(), s.key])
  );
  // Default catalog keys match DEFAULT_RELEASE_LIFECYCLE_STATUSES keys;
  // also accept label lookup when the live graph renamed keys but kept labels.
  const defaultKeyToLabel = new Map(
    lifecycle.statuses.map((s) => [s.key, s.label])
  );
  // Prefer: for each default rule key, find live status with same key, else same label from enterprise defaults.
  const enterpriseLabels: Record<string, string> = {
    draft: "Draft",
    planning: "Planning",
    testing: "Testing",
    uat: "UAT",
    pending_cab: "Pending CAB",
    cab_approved: "CAB Approved",
    ready_to_deploy: "Ready to deploy",
    deploying: "Deploying",
    deployed: "Deployed",
    closed: "Closed",
    cancelled: "Cancelled",
    blocked: "Blocked",
    rolled_back: "Rolled Back",
    deferred: "Deferred",
    rejected: "Rejected",
  };

  const out: FieldLockStatusRules = {};
  for (const [defaultKey, state] of Object.entries(defaultRules)) {
    if (lifecycle.statuses.some((s) => s.key === defaultKey)) {
      out[defaultKey] = state;
      continue;
    }
    const label = enterpriseLabels[defaultKey] ?? defaultKeyToLabel.get(defaultKey);
    if (!label) continue;
    const liveKey = labelToLiveKey.get(label.toLocaleLowerCase());
    if (liveKey) out[liveKey] = state;
  }
  return out;
}

function orphanKeys(
  rows: ReleaseFieldLockRow[],
  lifecycle: ReleaseLifecycleConfig
): string[] {
  const live = new Set(lifecycle.statuses.map((s) => s.key));
  const orphans = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.statusRules)) {
      if (!live.has(key)) orphans.add(key);
    }
  }
  return [...orphans].sort();
}

/**
 * Existing matrices locked Rejected like later mainline stages. Rework requires
 * those fields to reopen. Only upgrades locked → editable; never overwrites a
 * user-chosen side-effect cell.
 *
 * @param rows - Stored matrix rows.
 * @returns Rows plus field keys that need a persist.
 */
export function reconcileRejectedReworkUnlock(rows: ReleaseFieldLockRow[]): {
  rows: ReleaseFieldLockRow[];
  changedFieldKeys: string[];
} {
  const changedFieldKeys: string[] = [];
  const next = rows.map((row) => {
    const catalog = RELEASE_FIELD_LOCK_CATALOG.find((e) => e.fieldKey === row.fieldKey);
    if (!catalog || !catalog.isConfigurable) return row;
    if (catalog.defaultRules.rejected !== "editable") return row;
    if (
      row.statusRules.rejected === "editable" ||
      row.statusRules.rejected === "editable_with_side_effect"
    ) {
      return row;
    }
    changedFieldKeys.push(row.fieldKey);
    return {
      ...row,
      statusRules: { ...row.statusRules, rejected: "editable" as const },
    };
  });
  return { rows: next, changedFieldKeys };
}

async function seedDefaults(
  clerkUserId: string,
  lifecycle: ReleaseLifecycleConfig
): Promise<ReleaseFieldLockRow[]> {
  const rows: ReleaseFieldLockRow[] = RELEASE_FIELD_LOCK_CATALOG.filter(
    (e) => !e.unavailable
  ).map((entry) => ({
    fieldKey: entry.fieldKey,
    category: entry.category,
    lockRuleRef: entry.lockRuleRef,
    isConfigurable: entry.isConfigurable,
    statusRules: remapDefaultRulesToLiveKeys(entry.defaultRules, lifecycle),
  }));

  await prisma.userReleaseFieldLockConfig.createMany({
    data: rows.map((row) => ({
      id: randomUUID(),
      clerkUserId,
      organizationId: null,
      fieldKey: row.fieldKey,
      category: row.category,
      lockRuleRef: row.lockRuleRef,
      isConfigurable: row.isConfigurable,
      statusRules: row.statusRules as unknown as Prisma.InputJsonValue,
    })),
  });
  return rows;
}

/**
 * Load the caller's field-lock matrix, seeding Excel-aligned defaults on first access.
 * @param clerkUserId - Session user id (scope key).
 */
export async function loadReleaseFieldLockConfig(
  clerkUserId: string
): Promise<LoadedReleaseFieldLockConfig> {
  return withDbRetry(
    async () => {
      await ensureFieldLockTable();
      const { config: lifecycleConfig } =
        await loadReleaseLifecycleConfig(clerkUserId);

      const existing = await prisma.userReleaseFieldLockConfig.findMany({
        where: { clerkUserId },
        orderBy: { fieldKey: "asc" },
      });

      let rows: ReleaseFieldLockRow[];
      if (existing.length === 0) {
        rows = await seedDefaults(clerkUserId, lifecycleConfig);
      } else {
        rows = existing.map((row) => ({
          fieldKey: row.fieldKey,
          category: row.category,
          lockRuleRef: row.lockRuleRef,
          isConfigurable: row.isConfigurable,
          statusRules: parseStatusRules(row.statusRules),
        }));
        // Additive: new catalog fields (Tranche 3) appear without wiping user edits.
        const have = new Set(rows.map((r) => r.fieldKey));
        const missing = RELEASE_FIELD_LOCK_CATALOG.filter(
          (e) => !e.unavailable && !have.has(e.fieldKey)
        );
        if (missing.length > 0) {
          const added: ReleaseFieldLockRow[] = missing.map((entry) => ({
            fieldKey: entry.fieldKey,
            category: entry.category,
            lockRuleRef: entry.lockRuleRef,
            isConfigurable: entry.isConfigurable,
            statusRules: remapDefaultRulesToLiveKeys(
              entry.defaultRules,
              lifecycleConfig
            ),
          }));
          await prisma.userReleaseFieldLockConfig.createMany({
            data: added.map((row) => ({
              id: randomUUID(),
              clerkUserId,
              organizationId: null,
              fieldKey: row.fieldKey,
              category: row.category,
              lockRuleRef: row.lockRuleRef,
              isConfigurable: row.isConfigurable,
              statusRules: row.statusRules as unknown as Prisma.InputJsonValue,
            })),
            skipDuplicates: true,
          });
          rows = [...rows, ...added].sort((a, b) =>
            a.fieldKey.localeCompare(b.fieldKey)
          );
        }
        const unlocked = reconcileRejectedReworkUnlock(rows);
        if (unlocked.changedFieldKeys.length > 0) {
          rows = unlocked.rows;
          await Promise.all(
            unlocked.changedFieldKeys.map((fieldKey) => {
              const row = rows.find((r) => r.fieldKey === fieldKey);
              if (!row) return Promise.resolve();
              return prisma.userReleaseFieldLockConfig.updateMany({
                where: { clerkUserId, fieldKey },
                data: {
                  statusRules: row.statusRules as unknown as Prisma.InputJsonValue,
                },
              });
            })
          );
        }
      }

      return {
        rows,
        orphanStatusKeys: orphanKeys(rows, lifecycleConfig),
        lifecycleConfig,
      };
    },
    { label: "release-field-lock-config-load", attempts: 3, baseDelayMs: 600 }
  );
}

export type FieldLockPutRow = {
  fieldKey: string;
  statusRules: FieldLockStatusRules;
};

/**
 * Replace statusRules for configurable rows. Rejects isConfigurable=false overrides.
 * @throws Error with message suitable for API 400 when validation fails.
 */
export async function saveReleaseFieldLockConfig(
  clerkUserId: string,
  updates: FieldLockPutRow[]
): Promise<LoadedReleaseFieldLockConfig> {
  return withDbRetry(
    async () => {
      await ensureFieldLockTable();
      const loaded = await loadReleaseFieldLockConfig(clerkUserId);
      const byKey = new Map(loaded.rows.map((r) => [r.fieldKey, r]));
      const liveKeys = new Set(loaded.lifecycleConfig.statuses.map((s) => s.key));

      for (const update of updates) {
        const catalog = RELEASE_FIELD_LOCK_CATALOG.find(
          (e) => e.fieldKey === update.fieldKey
        );
        const current = byKey.get(update.fieldKey);
        if (!catalog || catalog.unavailable || catalog.infoOnly) {
          throw new Error(`Unknown or non-editable field lock row: ${update.fieldKey}`);
        }
        if (!catalog.isConfigurable || current?.isConfigurable === false) {
          throw new Error(
            `Field "${update.fieldKey}" is not configurable and cannot be changed`
          );
        }
        for (const [statusKey, state] of Object.entries(update.statusRules)) {
          if (!isFieldLockState(state)) {
            throw new Error(`Invalid lock state for ${update.fieldKey}.${statusKey}`);
          }
          if (!liveKeys.has(statusKey)) {
            throw new Error(
              `Unknown status key "${statusKey}" for field ${update.fieldKey}`
            );
          }
        }
      }

      for (const update of updates) {
        await prisma.userReleaseFieldLockConfig.update({
          where: {
            clerkUserId_fieldKey: {
              clerkUserId,
              fieldKey: update.fieldKey,
            },
          },
          data: {
            statusRules: update.statusRules as unknown as Prisma.InputJsonValue,
          },
        });
      }

      return loadReleaseFieldLockConfig(clerkUserId);
    },
    { label: "release-field-lock-config-save", attempts: 3, baseDelayMs: 600 }
  );
}

/**
 * Hardcoded catalog defaults for fail-soft when DB is unreachable.
 */
export function defaultFieldLockRowsFromCatalog(
  lifecycle: ReleaseLifecycleConfig
): ReleaseFieldLockRow[] {
  return RELEASE_FIELD_LOCK_CATALOG.filter((e) => !e.unavailable).map((entry) => ({
    fieldKey: entry.fieldKey,
    category: entry.category,
    lockRuleRef: entry.lockRuleRef,
    isConfigurable: entry.isConfigurable,
    statusRules: remapDefaultRulesToLiveKeys(entry.defaultRules, lifecycle),
  }));
}
