/**
 * Persist per-user conflict lifecycle config as versioned JSON snapshots.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  createDefaultConflictLifecycleConfig,
  normalizeConflictLifecycleConfig,
  validateConflictLifecycleConfig,
  type ConflictLifecycleConfig,
} from "@/lib/conflict-lifecycle-config";

let tablesReady: Promise<void> | null = null;

/**
 * Ensure the conflict lifecycle version table exists (Neon / deploy-safe).
 */
export async function ensureConflictLifecycleTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "UserConflictLifecycleConfigVersion" (
          "id" TEXT PRIMARY KEY,
          "clerkUserId" TEXT NOT NULL,
          "version" INTEGER NOT NULL,
          "snapshot" JSONB NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE ("clerkUserId", "version")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "UserConflictLifecycleConfigVersion_clerkUserId_version_idx"
        ON "UserConflictLifecycleConfigVersion" ("clerkUserId", "version" DESC)
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
 * Load the caller's conflict lifecycle config (seed default on first access).
 */
export async function loadConflictLifecycleConfig(
  clerkUserId: string
): Promise<{
  config: ConflictLifecycleConfig;
  version: number;
  versionId: string;
}> {
  await ensureConflictLifecycleTables();
  const rows = await prisma.$queryRawUnsafe<VersionRow[]>(
    `SELECT "id", "version", "snapshot" FROM "UserConflictLifecycleConfigVersion"
     WHERE "clerkUserId" = $1 ORDER BY "version" DESC LIMIT 1`,
    clerkUserId
  );
  const latest = rows[0];
  if (latest) {
    return {
      config: normalizeConflictLifecycleConfig(latest.snapshot),
      version: latest.version,
      versionId: latest.id,
    };
  }

  const defaults = createDefaultConflictLifecycleConfig();
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserConflictLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
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
export async function saveConflictLifecycleConfig(
  clerkUserId: string,
  config: ConflictLifecycleConfig
): Promise<ConflictLifecycleConfig> {
  const validationError = validateConflictLifecycleConfig(config);
  if (validationError) throw new Error(validationError);
  await ensureConflictLifecycleTables();

  const current = await loadConflictLifecycleConfig(clerkUserId);
  const nextVersion = current.version + 1;
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserConflictLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
     VALUES ($1, $2, $3, $4::jsonb)`,
    id,
    clerkUserId,
    nextVersion,
    JSON.stringify(config)
  );
  return config;
}
