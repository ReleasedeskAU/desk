/**
 * Persist per-user sign-off lifecycle config as versioned JSON snapshots.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  createDefaultSignoffLifecycleConfig,
  normalizeSignoffLifecycleConfig,
  validateSignoffLifecycleConfig,
  type SignoffLifecycleConfig,
} from "@/lib/signoff-lifecycle-config";
import { reconcileSignoffLifecycleSpec } from "@/lib/signoff-lifecycle-spec-reconcile";

let tablesReady: Promise<void> | null = null;

/**
 * Ensure the sign-off lifecycle version table exists (Neon / deploy-safe).
 */
export async function ensureSignoffLifecycleTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "UserSignoffLifecycleConfigVersion" (
          "id" TEXT PRIMARY KEY,
          "clerkUserId" TEXT NOT NULL,
          "version" INTEGER NOT NULL,
          "snapshot" JSONB NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE ("clerkUserId", "version")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "UserSignoffLifecycleConfigVersion_clerkUserId_version_idx"
        ON "UserSignoffLifecycleConfigVersion" ("clerkUserId", "version" DESC)
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
 * Load the caller's sign-off lifecycle config (seed default on first access).
 */
export async function loadSignoffLifecycleConfig(
  clerkUserId: string
): Promise<{ config: SignoffLifecycleConfig; version: number; versionId: string }> {
  await ensureSignoffLifecycleTables();
  const rows = await prisma.$queryRawUnsafe<VersionRow[]>(
    `SELECT "id", "version", "snapshot" FROM "UserSignoffLifecycleConfigVersion"
     WHERE "clerkUserId" = $1 ORDER BY "version" DESC LIMIT 1`,
    clerkUserId
  );
  const latest = rows[0];
  if (latest) {
    return {
      config: reconcileSignoffLifecycleSpec(
        normalizeSignoffLifecycleConfig(latest.snapshot)
      ),
      version: latest.version,
      versionId: latest.id,
    };
  }

  const defaults = createDefaultSignoffLifecycleConfig();
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserSignoffLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
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
export async function saveSignoffLifecycleConfig(
  clerkUserId: string,
  config: SignoffLifecycleConfig
): Promise<SignoffLifecycleConfig> {
  const validationError = validateSignoffLifecycleConfig(config);
  if (validationError) throw new Error(validationError);
  await ensureSignoffLifecycleTables();

  const current = await loadSignoffLifecycleConfig(clerkUserId);
  const nextVersion = current.version + 1;
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserSignoffLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
     VALUES ($1, $2, $3, $4::jsonb)`,
    id,
    clerkUserId,
    nextVersion,
    JSON.stringify(config)
  );
  return config;
}
