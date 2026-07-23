/**
 * Simple Risk Score (System 1) — banding for Risk.riskScore (likelihood × impact).
 * Bands are display/filtering only — never stored as a column.
 *
 * Cutoffs/labels come from UserRiskEngineConfig (via resolveSimpleRiskLevel).
 * Supports 3–6 dynamic bands; defaults remain 5 / 11 / 19.
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
 * @returns Band id (stable slug), not the display label.
 */
export function getRiskLevel(
  score: number,
  config: Pick<RiskEngineConfig, "simpleBands"> = DEFAULT_RISK_ENGINE_CONFIG
): RiskLevel {
  return resolveSimpleRiskLevel(score, config);
}

/** Graphite chip classes by band index (0 = lowest). Up to 6 bands. */
export const RISK_BAND_CHIP_BY_INDEX = [
  "bg-[#A8AFB1] text-[#1e293b] dark:bg-[#B8BFC2] dark:text-[#0f172a]",
  "bg-[#959CA3] text-[#0f172a] dark:bg-[#A8AFB6] dark:text-[#0f172a]",
  "bg-[#858C92] text-[#0f172a] dark:bg-[#9AA1A7] dark:text-[#0f172a]",
  "bg-[#6A655F] text-white dark:bg-[#8B837A] dark:text-white",
  "bg-[#4A5158] text-white dark:bg-[#636B73] dark:text-[#f8fafc]",
  "bg-[#333A40] text-white dark:bg-[#4B545C] dark:text-[#f8fafc]",
] as const;

/**
 * Chip class for a band id using relative order in config (maps onto a 6-stop palette).
 * @param bandId - Band id from getRiskLevel.
 * @param config - Engine config with simpleBands.
 */
export function riskLevelChipClass(
  bandId: RiskLevel,
  config: Pick<RiskEngineConfig, "simpleBands"> = DEFAULT_RISK_ENGINE_CONFIG
): string {
  const bands = config.simpleBands;
  const idx = bands.findIndex((b) => b.id === bandId);
  const i = idx < 0 ? Math.max(0, bands.length - 1) : idx;
  if (bands.length <= 1) return RISK_BAND_CHIP_BY_INDEX[0]!;
  const mapped = Math.round((i / (bands.length - 1)) * (RISK_BAND_CHIP_BY_INDEX.length - 1));
  return RISK_BAND_CHIP_BY_INDEX[Math.min(mapped, RISK_BAND_CHIP_BY_INDEX.length - 1)]!;
}

/** @deprecated Prefer riskLevelChipClass(bandId, config). */
export const RISK_LEVEL_COLOR: Record<string, string> = {
  low: RISK_BAND_CHIP_BY_INDEX[0],
  medium: RISK_BAND_CHIP_BY_INDEX[2],
  high: RISK_BAND_CHIP_BY_INDEX[3],
  critical: RISK_BAND_CHIP_BY_INDEX[5],
  LOW: RISK_BAND_CHIP_BY_INDEX[0],
  MEDIUM: RISK_BAND_CHIP_BY_INDEX[2],
  HIGH: RISK_BAND_CHIP_BY_INDEX[3],
  CRITICAL: RISK_BAND_CHIP_BY_INDEX[5],
};
