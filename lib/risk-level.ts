/**
 * Simple Risk Score (System 1) — derived banding for Risk.riskScore (likelihood × impact, range 1-25).
 * Bands are a display/filtering concern only — never stored as a column.
 *
 * Bands sourced from the Risk sheet's own embedded Summary Statistics box
 * (cross-checked against all 31 real risk scores — exact match: Low=3,
 * Medium=15, High=11, Critical=2). Supersedes an earlier prose-derived
 * reading of the bands that produced a different (incorrect) split.
 */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export function getRiskLevel(score: number): RiskLevel {
  if (score <= 5) return "LOW";
  if (score <= 11) return "MEDIUM";
  if (score <= 19) return "HIGH";
  return "CRITICAL";
}

/** Graphite band chips — same hex system as the Risk Heat Map. */
export const RISK_LEVEL_COLOR: Record<RiskLevel, string> = {
  LOW: "bg-[#A8AFB1] text-[#1e293b] dark:bg-[#B8BFC2] dark:text-[#0f172a]",
  MEDIUM: "bg-[#858C92] text-[#0f172a] dark:bg-[#9AA1A7] dark:text-[#0f172a]",
  HIGH: "bg-[#6A655F] text-white dark:bg-[#8B837A] dark:text-white",
  CRITICAL: "bg-[#333A40] text-white dark:bg-[#4B545C] dark:text-[#f8fafc]",
};
