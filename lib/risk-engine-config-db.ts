/**
 * Load / upsert UserRiskEngineConfig for a Clerk user.
 * Missing row → shipped defaults (not an error).
 */
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_RISK_ENGINE_CONFIG,
  normalizeRiskEngineConfig,
  type RiskEngineConfig,
  validateSimpleCutoffs,
  validateWeightedCutoffs,
} from "@/lib/risk-engine-config";

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
 * @throws Re-throws Prisma errors after validation.
 * @sideEffects Upserts UserRiskEngineConfig.
 */
export async function saveRiskEngineConfig(
  clerkUserId: string,
  config: RiskEngineConfig
): Promise<RiskEngineConfig> {
  const simpleErr = validateSimpleCutoffs(config.simpleBandCutoffs);
  if (simpleErr) throw new Error(simpleErr);
  const weightedErr = validateWeightedCutoffs(config.weightedBandCutoffs);
  if (weightedErr) throw new Error(weightedErr);

  const row = await prisma.userRiskEngineConfig.upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      likelihoodMax: config.likelihoodMax,
      impactMax: config.impactMax,
      simpleBandLabels: config.simpleBandLabels,
      simpleBandCutoffs: config.simpleBandCutoffs,
      weightedBandLabels: config.weightedBandLabels,
      weightedBandCutoffs: config.weightedBandCutoffs,
    },
    update: {
      likelihoodMax: config.likelihoodMax,
      impactMax: config.impactMax,
      simpleBandLabels: config.simpleBandLabels,
      simpleBandCutoffs: config.simpleBandCutoffs,
      weightedBandLabels: config.weightedBandLabels,
      weightedBandCutoffs: config.weightedBandCutoffs,
    },
  });
  return normalizeRiskEngineConfig(row);
}

export { DEFAULT_RISK_ENGINE_CONFIG };
