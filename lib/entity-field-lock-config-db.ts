/**
 * Persistence for per-user entity field-lock matrices (Blocker first).
 * Live/latest only — no lifecycle version pin. Additive table via ensure + script.
 */
import { randomUUID } from "node:crypto";
import type { Prisma } from "@releasedesk/database";
import { prisma, withDbRetry } from "@/lib/prisma";
import { BLOCKER_FIELD_LOCK_CATALOG } from "@/lib/blocker-field-lock-catalog";
import {
  isFieldLockState,
  remapFieldLockRulesToLiveKeys,
  type EntityFieldLockCatalogEntry,
  type EntityFieldLockType,
  type FieldLockStatusRules,
} from "@/lib/entity-field-lock";
import { loadBlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config-db";
import {
  createDefaultBlockerLifecycleConfig,
  type BlockerLifecycleConfig,
} from "@/lib/blocker-lifecycle-config";

export type EntityFieldLockRow = {
  fieldKey: string;
  category: string;
  lockRuleRef: string | null;
  isConfigurable: boolean;
  statusRules: FieldLockStatusRules;
};

export type LoadedEntityFieldLockConfig = {
  entityType: EntityFieldLockType;
  rows: EntityFieldLockRow[];
  orphanStatusKeys: string[];
  statuses: { key: string; label: string; sortOrder: number }[];
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

async function ensureEntityFieldLockTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserEntityFieldLockConfig" (
      "id" TEXT NOT NULL,
      "clerkUserId" TEXT NOT NULL,
      "organizationId" TEXT,
      "entityType" TEXT NOT NULL,
      "fieldKey" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "lockRuleRef" TEXT,
      "isConfigurable" BOOLEAN NOT NULL DEFAULT true,
      "statusRules" JSONB NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "UserEntityFieldLockConfig_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UserEntityFieldLockConfig_clerkUserId_entityType_fieldKey_key"
      ON "UserEntityFieldLockConfig"("clerkUserId", "entityType", "fieldKey")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserEntityFieldLockConfig_clerkUserId_entityType_idx"
      ON "UserEntityFieldLockConfig"("clerkUserId", "entityType")
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

function defaultKeyLabels(
  statuses: readonly { key: string; label: string }[]
): Record<string, string> {
  return Object.fromEntries(statuses.map((s) => [s.key, s.label]));
}

async function loadLiveStatuses(
  entityType: EntityFieldLockType,
  clerkUserId: string
): Promise<{ key: string; label: string; sortOrder: number }[]> {
  if (entityType === "blocker") {
    const { config } = await loadBlockerLifecycleConfig(clerkUserId);
    return config.statuses
      .filter((s) => s.enabled)
      .map((s) => ({ key: s.key, label: s.label, sortOrder: s.sortOrder }));
  }
  return [];
}

function orphanKeys(
  rows: EntityFieldLockRow[],
  liveKeys: Set<string>
): string[] {
  const orphans = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.statusRules)) {
      if (!liveKeys.has(key)) orphans.add(key);
    }
  }
  return [...orphans].sort();
}

function rowsFromCatalog(
  catalog: readonly EntityFieldLockCatalogEntry[],
  liveStatuses: readonly { key: string; label: string }[]
): EntityFieldLockRow[] {
  const labels = defaultKeyLabels(liveStatuses);
  return catalog
    .filter((e) => !e.unavailable)
    .map((entry) => ({
      fieldKey: entry.fieldKey,
      category: entry.category,
      lockRuleRef: entry.lockRuleRef,
      isConfigurable: entry.isConfigurable,
      statusRules: remapFieldLockRulesToLiveKeys(
        entry.defaultRules,
        liveStatuses,
        labels
      ),
    }));
}

async function seedDefaults(
  clerkUserId: string,
  entityType: EntityFieldLockType,
  liveStatuses: { key: string; label: string }[]
): Promise<EntityFieldLockRow[]> {
  const rows = rowsFromCatalog(catalogFor(entityType), liveStatuses);
  await prisma.userEntityFieldLockConfig.createMany({
    data: rows.map((row) => ({
      id: randomUUID(),
      clerkUserId,
      organizationId: null,
      entityType,
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
 * Load the caller’s matrix for one entity type, seeding catalog defaults on first access.
 */
export async function loadEntityFieldLockConfig(
  clerkUserId: string,
  entityType: EntityFieldLockType
): Promise<LoadedEntityFieldLockConfig> {
  return withDbRetry(
    async () => {
      await ensureEntityFieldLockTable();
      const statuses = await loadLiveStatuses(entityType, clerkUserId);
      const catalog = catalogFor(entityType);
      const existing = await prisma.userEntityFieldLockConfig.findMany({
        where: { clerkUserId, entityType },
        orderBy: { fieldKey: "asc" },
      });

      let rows: EntityFieldLockRow[];
      if (existing.length === 0) {
        rows = await seedDefaults(clerkUserId, entityType, statuses);
      } else {
        rows = existing.map((row) => ({
          fieldKey: row.fieldKey,
          category: row.category,
          lockRuleRef: row.lockRuleRef,
          isConfigurable: row.isConfigurable,
          statusRules: parseStatusRules(row.statusRules),
        }));
        const have = new Set(rows.map((r) => r.fieldKey));
        const missing = catalog.filter(
          (e) => !e.unavailable && !have.has(e.fieldKey)
        );
        if (missing.length > 0) {
          const added = rowsFromCatalog(missing, statuses);
          await prisma.userEntityFieldLockConfig.createMany({
            data: added.map((row) => ({
              id: randomUUID(),
              clerkUserId,
              organizationId: null,
              entityType,
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
      }

      return {
        entityType,
        rows,
        orphanStatusKeys: orphanKeys(rows, new Set(statuses.map((s) => s.key))),
        statuses,
      };
    },
    { label: "entity-field-lock-config-load", attempts: 3, baseDelayMs: 600 }
  );
}

export type EntityFieldLockPutRow = {
  fieldKey: string;
  statusRules: FieldLockStatusRules;
};

/**
 * Replace statusRules for configurable rows. Non-configurable fields cannot be saved.
 * @throws Error with a client-safe message for API 400.
 */
export async function saveEntityFieldLockConfig(
  clerkUserId: string,
  entityType: EntityFieldLockType,
  updates: EntityFieldLockPutRow[]
): Promise<LoadedEntityFieldLockConfig> {
  return withDbRetry(
    async () => {
      await ensureEntityFieldLockTable();
      const loaded = await loadEntityFieldLockConfig(clerkUserId, entityType);
      const catalog = catalogFor(entityType);
      const byKey = new Map(loaded.rows.map((r) => [r.fieldKey, r]));
      const liveKeys = new Set(loaded.statuses.map((s) => s.key));

      for (const update of updates) {
        const entry = catalog.find((e) => e.fieldKey === update.fieldKey);
        const current = byKey.get(update.fieldKey);
        if (!entry || entry.unavailable || entry.infoOnly) {
          throw new Error(`Unknown or non-editable field lock row: ${update.fieldKey}`);
        }
        if (!entry.isConfigurable || current?.isConfigurable === false) {
          throw new Error(
            `“${entry.label}” is always locked and cannot be changed in Field Locks.`
          );
        }
        for (const [statusKey, state] of Object.entries(update.statusRules)) {
          if (!isFieldLockState(state)) {
            throw new Error(`Invalid lock state for ${entry.label}.`);
          }
          if (!liveKeys.has(statusKey)) {
            throw new Error(
              `Unknown status for “${entry.label}”. Refresh Statuses and try again.`
            );
          }
        }
      }

      for (const update of updates) {
        await prisma.userEntityFieldLockConfig.update({
          where: {
            clerkUserId_entityType_fieldKey: {
              clerkUserId,
              entityType,
              fieldKey: update.fieldKey,
            },
          },
          data: {
            statusRules: update.statusRules as unknown as Prisma.InputJsonValue,
          },
        });
      }

      return loadEntityFieldLockConfig(clerkUserId, entityType);
    },
    { label: "entity-field-lock-config-save", attempts: 3, baseDelayMs: 600 }
  );
}

/**
 * Catalog defaults when the DB is unreachable (fail-soft).
 */
export function defaultEntityFieldLockRows(
  entityType: EntityFieldLockType,
  lifecycle: BlockerLifecycleConfig = createDefaultBlockerLifecycleConfig()
): EntityFieldLockRow[] {
  return rowsFromCatalog(
    catalogFor(entityType),
    lifecycle.statuses.map((s) => ({ key: s.key, label: s.label }))
  );
}
