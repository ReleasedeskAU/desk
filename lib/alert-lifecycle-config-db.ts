/**
 * Persist per-user alert lifecycle config as versioned JSON snapshots.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  createDefaultAlertLifecycleConfig,
  normalizeAlertLifecycleConfig,
  validateAlertLifecycleConfig,
  type AlertLifecycleConfig,
} from "@/lib/alert-lifecycle-config";
import { reconcileAlertLifecycleSpec } from "@/lib/alert-lifecycle-spec-reconcile";

let tablesReady: Promise<void> | null = null;

/**
 * Ensure the alert lifecycle version table exists (Neon / deploy-safe).
 */
export async function ensureAlertLifecycleTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "UserAlertLifecycleConfigVersion" (
          "id" TEXT PRIMARY KEY,
          "clerkUserId" TEXT NOT NULL,
          "version" INTEGER NOT NULL,
          "snapshot" JSONB NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE ("clerkUserId", "version")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "UserAlertLifecycleConfigVersion_clerkUserId_version_idx"
        ON "UserAlertLifecycleConfigVersion" ("clerkUserId", "version" DESC)
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
 * Load the caller's alert lifecycle config (seed default on first access).
 */
export async function loadAlertLifecycleConfig(
  clerkUserId: string
): Promise<{
  config: AlertLifecycleConfig;
  version: number;
  versionId: string;
}> {
  await ensureAlertLifecycleTables();
  const rows = await prisma.$queryRawUnsafe<VersionRow[]>(
    `SELECT "id", "version", "snapshot" FROM "UserAlertLifecycleConfigVersion"
     WHERE "clerkUserId" = $1 ORDER BY "version" DESC LIMIT 1`,
    clerkUserId
  );
  const latest = rows[0];
  if (latest) {
    return {
      config: reconcileAlertLifecycleSpec(
        normalizeAlertLifecycleConfig(latest.snapshot)
      ),
      version: latest.version,
      versionId: latest.id,
    };
  }

  const defaults = createDefaultAlertLifecycleConfig();
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserAlertLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
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
export async function saveAlertLifecycleConfig(
  clerkUserId: string,
  config: AlertLifecycleConfig
): Promise<AlertLifecycleConfig> {
  const validationError = validateAlertLifecycleConfig(config);
  if (validationError) throw new Error(validationError);
  await ensureAlertLifecycleTables();

  const current = await loadAlertLifecycleConfig(clerkUserId);
  const nextVersion = current.version + 1;
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserAlertLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
     VALUES ($1, $2, $3, $4::jsonb)`,
    id,
    clerkUserId,
    nextVersion,
    JSON.stringify(config)
  );
  return config;
}
