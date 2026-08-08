/**
 * Persist per-user drift lifecycle config as versioned JSON snapshots.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  createDefaultDriftLifecycleConfig,
  normalizeDriftLifecycleConfig,
  validateDriftLifecycleConfig,
  type DriftLifecycleConfig,
} from "@/lib/drift-lifecycle-config";

let tablesReady: Promise<void> | null = null;

/**
 * Ensure the drift lifecycle version table exists (Neon / deploy-safe).
 */
export async function ensureDriftLifecycleTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "UserDriftLifecycleConfigVersion" (
          "id" TEXT PRIMARY KEY,
          "clerkUserId" TEXT NOT NULL,
          "version" INTEGER NOT NULL,
          "snapshot" JSONB NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE ("clerkUserId", "version")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "UserDriftLifecycleConfigVersion_clerkUserId_version_idx"
        ON "UserDriftLifecycleConfigVersion" ("clerkUserId", "version" DESC)
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
 * Load the caller's drift lifecycle config (seed default on first access).
 */
export async function loadDriftLifecycleConfig(
  clerkUserId: string
): Promise<{ config: DriftLifecycleConfig; version: number; versionId: string }> {
  await ensureDriftLifecycleTables();
  const rows = await prisma.$queryRawUnsafe<VersionRow[]>(
    `SELECT "id", "version", "snapshot" FROM "UserDriftLifecycleConfigVersion"
     WHERE "clerkUserId" = $1 ORDER BY "version" DESC LIMIT 1`,
    clerkUserId
  );
  const latest = rows[0];
  if (latest) {
    return {
      config: normalizeDriftLifecycleConfig(latest.snapshot),
      version: latest.version,
      versionId: latest.id,
    };
  }

  const defaults = createDefaultDriftLifecycleConfig();
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserDriftLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
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
export async function saveDriftLifecycleConfig(
  clerkUserId: string,
  config: DriftLifecycleConfig
): Promise<DriftLifecycleConfig> {
  const validationError = validateDriftLifecycleConfig(config);
  if (validationError) throw new Error(validationError);
  await ensureDriftLifecycleTables();

  const current = await loadDriftLifecycleConfig(clerkUserId);
  const nextVersion = current.version + 1;
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserDriftLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
     VALUES ($1, $2, $3, $4::jsonb)`,
    id,
    clerkUserId,
    nextVersion,
    JSON.stringify(config)
  );
  return config;
}
