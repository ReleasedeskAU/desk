/**
 * Persist per-user approval lifecycle config as versioned JSON snapshots.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  createDefaultApprovalLifecycleConfig,
  normalizeApprovalLifecycleConfig,
  validateApprovalLifecycleConfig,
  type ApprovalLifecycleConfig,
} from "@/lib/approval-lifecycle-config";

let tablesReady: Promise<void> | null = null;

/**
 * Ensure the approval lifecycle version table exists (Neon / deploy-safe).
 */
export async function ensureApprovalLifecycleTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "UserApprovalLifecycleConfigVersion" (
          "id" TEXT PRIMARY KEY,
          "clerkUserId" TEXT NOT NULL,
          "version" INTEGER NOT NULL,
          "snapshot" JSONB NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE ("clerkUserId", "version")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "UserApprovalLifecycleConfigVersion_clerkUserId_version_idx"
        ON "UserApprovalLifecycleConfigVersion" ("clerkUserId", "version" DESC)
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
 * Load the caller's approval lifecycle config (seed default on first access).
 */
export async function loadApprovalLifecycleConfig(
  clerkUserId: string
): Promise<{ config: ApprovalLifecycleConfig; version: number; versionId: string }> {
  await ensureApprovalLifecycleTables();
  const rows = await prisma.$queryRawUnsafe<VersionRow[]>(
    `SELECT "id", "version", "snapshot" FROM "UserApprovalLifecycleConfigVersion"
     WHERE "clerkUserId" = $1 ORDER BY "version" DESC LIMIT 1`,
    clerkUserId
  );
  const latest = rows[0];
  if (latest) {
    return {
      config: normalizeApprovalLifecycleConfig(latest.snapshot),
      version: latest.version,
      versionId: latest.id,
    };
  }

  const defaults = createDefaultApprovalLifecycleConfig();
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserApprovalLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
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
export async function saveApprovalLifecycleConfig(
  clerkUserId: string,
  config: ApprovalLifecycleConfig
): Promise<ApprovalLifecycleConfig> {
  const validationError = validateApprovalLifecycleConfig(config);
  if (validationError) throw new Error(validationError);
  await ensureApprovalLifecycleTables();

  const current = await loadApprovalLifecycleConfig(clerkUserId);
  const nextVersion = current.version + 1;
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserApprovalLifecycleConfigVersion" ("id", "clerkUserId", "version", "snapshot")
     VALUES ($1, $2, $3, $4::jsonb)`,
    id,
    clerkUserId,
    nextVersion,
    JSON.stringify(config)
  );
  return config;
}
