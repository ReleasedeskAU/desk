/**
 * Persist per-user risk lifecycle config as versioned JSON snapshots.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  createDefaultRiskLifecycleConfig,
  normalizeRiskLifecycleConfig,
  validateRiskLifecycleConfig,
  type RiskLifecycleConfig,
} from "@/lib/risk-lifecycle-config";
import { reconcileRiskLifecycleSpec } from "@/lib/risk-lifecycle-spec-reconcile";

let tablesReady: Promise<void> | null = null;

/**
 * Ensure the risk lifecycle version table exists (Neon / deploy-safe).
 */
export async function ensureRiskLifecycleTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "UserRiskLifecycleConfigVersion" (
          "id" TEXT PRIMARY KEY,
          "clerkUserId" TEXT NOT NULL,
          "version" INTEGER NOT NULL,
          "snapshot" JSONB NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE ("clerkUserId", "version")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "UserRiskLifecycleConfigVersion_clerkUserId_version_idx"
        ON "UserRiskLifecycleConfigVersion" ("clerkUserId", "version" DESC)
      `);
    })().catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  await tablesReady;
}

type VersionRow = {
  id: string;
  version: number;
  snapshot: unknown;
};

/**
 * Load the caller's risk lifecycle config (seed default on first access).
 */
export async function loadRiskLifecycleConfig(
  clerkUserId: string
): Promise<{ config: RiskLifecycleConfig; version: number; versionId: string }> {
  await ensureRiskLifecycleTables();
  const rows = await prisma.$queryRawUnsafe<VersionRow[]>(
    `SELECT "id", "version", "snapshot" FROM "UserRiskLifecycleConfigVersion"
     WHERE "clerkUserId" = $1 ORDER BY "version" DESC LIMIT 1`,
    clerkUserId
  );
  const latest = rows[0];
  if (latest) {
    return {
      config: reconcileRiskLifecycleSpec(
        normalizeRiskLifecycleConfig(latest.snapshot)
      ),
      version: latest.version,
      versionId: latest.id,
    };
  }

  const defaults = createDefaultRiskLifecycleConfig();
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserRiskLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
     VALUES ($1, $2, 1, $3::jsonb)`,
    id,
    clerkUserId,
    JSON.stringify(defaults)
  );
  return { config: defaults, version: 1, versionId: id };
}

/**
 * Append a new immutable version after validation.
 * @throws Error when validation fails.
 */
export async function saveRiskLifecycleConfig(
  clerkUserId: string,
  config: RiskLifecycleConfig
): Promise<RiskLifecycleConfig> {
  const validationError = validateRiskLifecycleConfig(config);
  if (validationError) throw new Error(validationError);
  await ensureRiskLifecycleTables();

  const current = await loadRiskLifecycleConfig(clerkUserId);
  const nextVersion = current.version + 1;
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserRiskLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
     VALUES ($1, $2, $3, $4::jsonb)`,
    id,
    clerkUserId,
    nextVersion,
    JSON.stringify(config)
  );
  return config;
}
