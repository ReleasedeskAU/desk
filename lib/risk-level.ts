/**
 * Simple Risk Score (System 1) — banding for Risk.riskScore (likelihood × impact).
 * Bands are display/filtering only — never stored as a column.
 *
 * Cutoffs/labels come from UserRiskEngineConfig (via resolveSimpleRiskLevel).
 * Defaults remain the sheet-verified 5 / 11 / 19 split.
 */
import {
  DEFAULT_RISK_ENGINE_CONFIG,
  resolveSimpleRiskLevel,
  type RiskEngineConfig,
  type RiskLevel,
} from "@/lib/risk-engine-config";

export type { RiskLevel };

/**
 * Classify a simple risk score. Optional config enables per-user thresholds;
 * omitting config uses today's shipped defaults (never errors).
 *
 * @param score - likelihood × impact.
 * @param config - Optional engine config (defaults applied when omitted).
 */
export function getRiskLevel(
  score: number,
  config: Pick<RiskEngineConfig, "simpleBandCutoffs"> = DEFAULT_RISK_ENGINE_CONFIG
): RiskLevel {
  return resolveSimpleRiskLevel(score, config);
}

/** Graphite band chips — same hex system as the Risk Heat Map. */
export const RISK_LEVEL_COLOR: Record<RiskLevel, string> = {
  LOW: "bg-[#A8AFB1] text-[#1e293b] dark:bg-[#B8BFC2] dark:text-[#0f172a]",
  MEDIUM: "bg-[#858C92] text-[#0f172a] dark:bg-[#9AA1A7] dark:text-[#0f172a]",
  HIGH: "bg-[#6A655F] text-white dark:bg-[#8B837A] dark:text-white",
  CRITICAL: "bg-[#333A40] text-white dark:bg-[#4B545C] dark:text-[#f8fafc]",
};
