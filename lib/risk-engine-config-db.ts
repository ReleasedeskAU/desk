/**
 * Load / upsert UserRiskEngineConfig for a Clerk user.
 * Missing row → shipped defaults (not an error).
 *
 * Save ensures the table exists (CREATE IF NOT EXISTS) so preview/prod DBs
 * that never ran the migration still accept Settings → Risk Engine writes.
 * Simple bands persist as v2 `{ v:2, bands }` in simpleBandCutoffs JSON.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@releasedesk/database";
import {
  DEFAULT_RISK_ENGINE_CONFIG,
  normalizeRiskEngineConfig,
  toPersistedSimpleBandJson,
  toPersistedWeightedCutoffsJson,
  type RiskEngineConfig,
  validateSimpleBands,
  validateWeightedCutoffs,
} from "@/lib/risk-engine-config";

/**
 * Idempotent DDL so Settings save works even when migrate deploy was skipped
 * on the target Neon (common for preview DBs).
 * @sideEffects May CREATE UserRiskEngineConfig + unique index.
 */
async function ensureUserRiskEngineConfigTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserRiskEngineConfig" (
      "id" TEXT NOT NULL,
      "clerkUserId" TEXT NOT NULL,
      "likelihoodMax" INTEGER NOT NULL DEFAULT 5,
      "impactMax" INTEGER NOT NULL DEFAULT 5,
      "simpleBandLabels" JSONB NOT NULL,
      "simpleBandCutoffs" JSONB NOT NULL,
      "weightedBandLabels" JSONB NOT NULL,
      "weightedBandCutoffs" JSONB NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "UserRiskEngineConfig_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UserRiskEngineConfig_clerkUserId_key"
      ON "UserRiskEngineConfig"("clerkUserId")
  `);
}

/**
 * Load the user's risk engine config, or defaults when no row exists.
 * @param clerkUserId - Clerk user id.
 * @returns Normalized config (always complete).
 * @sideEffects Reads UserRiskEngineConfig via Prisma.
 */
export async function loadRiskEngineConfig(
  clerkUserId: string
): Promise<RiskEngineConfig> {
  try {
    const row = await prisma.userRiskEngineConfig.findUnique({
      where: { clerkUserId },
    });
    if (!row) return normalizeRiskEngineConfig(null);
    return normalizeRiskEngineConfig(row);
  } catch {
    // Table missing mid-migrate or transient DB — fail open to defaults.
    return normalizeRiskEngineConfig(null);
  }
}

/**
 * Upsert the user's risk engine config.
 * @param clerkUserId - Clerk user id.
 * @param config - Full validated config to persist.
 * @returns Saved normalized config.
 * @throws Re-throws Prisma errors after validation / ensure-table.
 * @sideEffects May create table; upserts UserRiskEngineConfig.
 */
export async function saveRiskEngineConfig(
  clerkUserId: string,
  config: RiskEngineConfig
): Promise<RiskEngineConfig> {
  const simpleErr = validateSimpleBands(config.simpleBands);
  if (simpleErr) throw new Error(simpleErr);
  const weightedErr = validateWeightedCutoffs(config.weightedBandCutoffs);
  if (weightedErr) throw new Error(weightedErr);

  await ensureUserRiskEngineConfigTable();

  const persisted = toPersistedSimpleBandJson(config.simpleBands);
  const json = {
    simpleBandLabels: persisted.simpleBandLabels as Prisma.InputJsonValue,
    simpleBandCutoffs: persisted.simpleBandCutoffs as Prisma.InputJsonValue,
    weightedBandLabels: config.weightedBandLabels as Prisma.InputJsonValue,
    weightedBandCutoffs: toPersistedWeightedCutoffsJson(
      config.weightedBandCutoffs,
      config.weightedRiskEnabled
    ) as Prisma.InputJsonValue,
  };

  const row = await prisma.userRiskEngineConfig.upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      likelihoodMax: config.likelihoodMax,
      impactMax: config.impactMax,
      ...json,
    },
    update: {
      likelihoodMax: config.likelihoodMax,
      impactMax: config.impactMax,
      ...json,
    },
  });
  return normalizeRiskEngineConfig(row);
}

export { DEFAULT_RISK_ENGINE_CONFIG };
