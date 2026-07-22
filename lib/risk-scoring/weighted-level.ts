/**
 * Weighted Risk Score (System 2) — level banding.
 * Cutoffs/labels come from UserRiskEngineConfig; defaults match the Excel formula
 * (1.5 / 2.5 / 3.5 / 4.0 exclusive upper bounds). Distinct from Simple Risk bands.
 *
 * DEFERRED (separate ticket): call computeWeightedRiskScore when RiskFactor
 * weights/inputs change — catalog edits currently do not refresh Release scores.
 */
import {
  DEFAULT_RISK_ENGINE_CONFIG,
  resolveWeightedRiskLevel,
  type RiskEngineConfig,
  type WeightedRiskLevel,
} from "@/lib/risk-engine-config";

export type { WeightedRiskLevel };

/**
 * Classify a weighted risk score using config cutoffs (defaults when omitted).
 * @param score - weightedRiskScore.
 * @param config - Optional engine config.
 */
export function getWeightedRiskLevel(
  score: number,
  config: Pick<RiskEngineConfig, "weightedBandCutoffs"> = DEFAULT_RISK_ENGINE_CONFIG
): WeightedRiskLevel {
  return resolveWeightedRiskLevel(score, config);
}

export const WEIGHTED_RISK_LEVEL_COLOR: Record<WeightedRiskLevel, string> = {
  LOW: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300",
  CRITICAL: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
  SEVERE: "bg-red-200 text-red-900 dark:bg-red-500/30 dark:text-red-200",
};
