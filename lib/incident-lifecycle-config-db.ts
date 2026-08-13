/**
 * Persist per-user incident lifecycle config as versioned JSON snapshots.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  createDefaultIncidentLifecycleConfig,
  normalizeIncidentLifecycleConfig,
  validateIncidentLifecycleConfig,
  type IncidentLifecycleConfig,
} from "@/lib/incident-lifecycle-config";
import { reconcileIncidentLifecycleSpec } from "@/lib/incident-lifecycle-spec-reconcile";

let tablesReady: Promise<void> | null = null;

/**
 * Ensure the incident lifecycle version table exists (Neon / deploy-safe).
 */
export async function ensureIncidentLifecycleTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "UserIncidentLifecycleConfigVersion" (
          "id" TEXT PRIMARY KEY,
          "clerkUserId" TEXT NOT NULL,
          "version" INTEGER NOT NULL,
          "snapshot" JSONB NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE ("clerkUserId", "version")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "UserIncidentLifecycleConfigVersion_clerkUserId_version_idx"
        ON "UserIncidentLifecycleConfigVersion" ("clerkUserId", "version" DESC)
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
 * Load the caller's incident lifecycle config (seed default on first access).
 */
export async function loadIncidentLifecycleConfig(
  clerkUserId: string
): Promise<{ config: IncidentLifecycleConfig; version: number; versionId: string }> {
  await ensureIncidentLifecycleTables();
  const rows = await prisma.$queryRawUnsafe<VersionRow[]>(
    `SELECT "id", "version", "snapshot" FROM "UserIncidentLifecycleConfigVersion"
     WHERE "clerkUserId" = $1 ORDER BY "version" DESC LIMIT 1`,
    clerkUserId
  );
  const latest = rows[0];
  if (latest) {
    return {
      config: reconcileIncidentLifecycleSpec(
        normalizeIncidentLifecycleConfig(latest.snapshot)
      ),
      version: latest.version,
      versionId: latest.id,
    };
  }

  const defaults = createDefaultIncidentLifecycleConfig();
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserIncidentLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
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
export async function saveIncidentLifecycleConfig(
  clerkUserId: string,
  config: IncidentLifecycleConfig
): Promise<IncidentLifecycleConfig> {
  const validationError = validateIncidentLifecycleConfig(config);
  if (validationError) throw new Error(validationError);
  await ensureIncidentLifecycleTables();

  const current = await loadIncidentLifecycleConfig(clerkUserId);
  const nextVersion = current.version + 1;
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserIncidentLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
     VALUES ($1, $2, $3, $4::jsonb)`,
    id,
    clerkUserId,
    nextVersion,
    JSON.stringify(config)
  );
  return config;
}
