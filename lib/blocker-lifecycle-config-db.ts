/**
 * Persist per-user blocker lifecycle config as versioned JSON snapshots.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  createDefaultBlockerLifecycleConfig,
  normalizeBlockerLifecycleConfig,
  validateBlockerLifecycleConfig,
  type BlockerLifecycleConfig,
} from "@/lib/blocker-lifecycle-config";

let tablesReady: Promise<void> | null = null;

/**
 * Ensure the blocker lifecycle version table exists (Neon / deploy-safe).
 */
export async function ensureBlockerLifecycleTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "UserBlockerLifecycleConfigVersion" (
          "id" TEXT PRIMARY KEY,
          "clerkUserId" TEXT NOT NULL,
          "version" INTEGER NOT NULL,
          "snapshot" JSONB NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE ("clerkUserId", "version")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "UserBlockerLifecycleConfigVersion_clerkUserId_version_idx"
        ON "UserBlockerLifecycleConfigVersion" ("clerkUserId", "version" DESC)
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
 * Load the caller's blocker lifecycle config (seed default on first access).
 */
export async function loadBlockerLifecycleConfig(
  clerkUserId: string
): Promise<{ config: BlockerLifecycleConfig; version: number; versionId: string }> {
  await ensureBlockerLifecycleTables();
  const rows = await prisma.$queryRawUnsafe<VersionRow[]>(
    `SELECT "id", "version", "snapshot" FROM "UserBlockerLifecycleConfigVersion"
     WHERE "clerkUserId" = $1 ORDER BY "version" DESC LIMIT 1`,
    clerkUserId
  );
  const latest = rows[0];
  if (latest) {
    return {
      config: normalizeBlockerLifecycleConfig(latest.snapshot),
      version: latest.version,
      versionId: latest.id,
    };
  }

  const defaults = createDefaultBlockerLifecycleConfig();
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserBlockerLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
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
export async function saveBlockerLifecycleConfig(
  clerkUserId: string,
  config: BlockerLifecycleConfig
): Promise<BlockerLifecycleConfig> {
  const validationError = validateBlockerLifecycleConfig(config);
  if (validationError) throw new Error(validationError);
  await ensureBlockerLifecycleTables();

  const current = await loadBlockerLifecycleConfig(clerkUserId);
  const nextVersion = current.version + 1;
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserBlockerLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
     VALUES ($1, $2, $3, $4::jsonb)`,
    id,
    clerkUserId,
    nextVersion,
    JSON.stringify(config)
  );
  return config;
}
