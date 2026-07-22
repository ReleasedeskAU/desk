/**
 * User-configurable risk engine settings (Simple + Weighted thresholds/labels).
 * Defaults match today's shipped behavior (Simple 5/11/19; Weighted 1.5/2.5/3.5/4.0).
 *
 * Per-user now (clerkUserId); shape is org-migration ready.
 * Band rules (raw→1-5 per RiskFactor) remain code — deferred fast-follow.
 * Wiring computeWeightedRiskScore on factor edits — deferred separate ticket.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type WeightedRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "SEVERE";

export type SimpleBandLabels = {
  low: string;
  medium: string;
  high: string;
  critical: string;
};

export type SimpleBandCutoffs = {
  /** Inclusive upper bound for LOW (default 5). */
  low: number;
  /** Inclusive upper bound for MEDIUM (default 11). */
  medium: number;
  /** Inclusive upper bound for HIGH (default 19); above → CRITICAL. */
  high: number;
};

export type WeightedBandLabels = {
  low: string;
  medium: string;
  high: string;
  critical: string;
  severe: string;
};

export type WeightedBandCutoffs = {
  /** Exclusive upper bound for LOW (default 1.5). */
  low: number;
  /** Exclusive upper bound for MEDIUM (default 2.5). */
  medium: number;
  /** Exclusive upper bound for HIGH (default 3.5). */
  high: number;
  /** Exclusive upper bound for CRITICAL (default 4.0); at/above → SEVERE. */
  critical: number;
};

export type RiskEngineConfig = {
  likelihoodMax: number;
  impactMax: number;
  simpleBandLabels: SimpleBandLabels;
  simpleBandCutoffs: SimpleBandCutoffs;
  weightedBandLabels: WeightedBandLabels;
  weightedBandCutoffs: WeightedBandCutoffs;
};

/** Today's real shipped defaults — used when no UserRiskEngineConfig row exists. */
export const DEFAULT_RISK_ENGINE_CONFIG: RiskEngineConfig = {
  likelihoodMax: 5,
  impactMax: 5,
  simpleBandLabels: {
    low: "LOW",
    medium: "MEDIUM",
    high: "HIGH",
    critical: "CRITICAL",
  },
  simpleBandCutoffs: { low: 5, medium: 11, high: 19 },
  weightedBandLabels: {
    low: "LOW",
    medium: "MEDIUM",
    high: "HIGH",
    critical: "CRITICAL",
    severe: "SEVERE",
  },
  weightedBandCutoffs: { low: 1.5, medium: 2.5, high: 3.5, critical: 4.0 },
};

/**
 * Classify a Simple Risk score (likelihood × impact) using config cutoffs.
 * Inclusive upper bounds — matches historical getRiskLevel(5/11/19).
 *
 * @param score - Computed riskScore.
 * @param config - Engine config (defaults to shipped defaults).
 * @returns Canonical band key (not the display label).
 */
export function resolveSimpleRiskLevel(
  score: number,
  config: Pick<RiskEngineConfig, "simpleBandCutoffs"> = DEFAULT_RISK_ENGINE_CONFIG
): RiskLevel {
  const { low, medium, high } = config.simpleBandCutoffs;
  if (score <= low) return "LOW";
  if (score <= medium) return "MEDIUM";
  if (score <= high) return "HIGH";
  return "CRITICAL";
}

/**
 * Classify a Weighted Risk score using exclusive upper-bound cutoffs.
 * Matches historical getWeightedRiskLevel(1.5/2.5/3.5/4.0).
 *
 * @param score - weightedRiskScore.
 * @param config - Engine config (defaults to shipped defaults).
 */
export function resolveWeightedRiskLevel(
  score: number,
  config: Pick<RiskEngineConfig, "weightedBandCutoffs"> = DEFAULT_RISK_ENGINE_CONFIG
): WeightedRiskLevel {
  const { low, medium, high, critical } = config.weightedBandCutoffs;
  if (score < low) return "LOW";
  if (score < medium) return "MEDIUM";
  if (score < high) return "HIGH";
  if (score < critical) return "CRITICAL";
  return "SEVERE";
}

/**
 * Display label for a Simple band key from config.
 * @param level - Canonical key.
 * @param config - Engine config.
 */
export function simpleRiskLevelLabel(
  level: RiskLevel,
  config: Pick<RiskEngineConfig, "simpleBandLabels"> = DEFAULT_RISK_ENGINE_CONFIG
): string {
  const map = {
    LOW: config.simpleBandLabels.low,
    MEDIUM: config.simpleBandLabels.medium,
    HIGH: config.simpleBandLabels.high,
    CRITICAL: config.simpleBandLabels.critical,
  };
  return map[level];
}

/**
 * Tailwind fill classes for RiskMatrix cells — driven by the SAME band resolver
 * as list/heat-map/detail so they cannot disagree.
 */
export const SIMPLE_RISK_MATRIX_FILL: Record<RiskLevel, string> = {
  LOW: "bg-emerald-300",
  MEDIUM: "bg-amber-300",
  HIGH: "bg-orange-400",
  CRITICAL: "bg-rose-500",
};

/**
 * Validate cutoffs are strictly increasing (simple inclusive bounds).
 * @returns Error message or null if valid.
 */
export function validateSimpleCutoffs(c: SimpleBandCutoffs): string | null {
  if (!(c.low < c.medium && c.medium < c.high)) {
    return "Simple band cutoffs must satisfy low < medium < high";
  }
  if (c.low < 1 || c.high > 1000) {
    return "Simple band cutoffs are out of range";
  }
  return null;
}

/**
 * Validate weighted exclusive cutoffs are strictly increasing.
 * @returns Error message or null if valid.
 */
export function validateWeightedCutoffs(c: WeightedBandCutoffs): string | null {
  if (!(c.low < c.medium && c.medium < c.high && c.high < c.critical)) {
    return "Weighted band cutoffs must satisfy low < medium < high < critical";
  }
  if (c.low <= 0 || c.critical > 100) {
    return "Weighted band cutoffs are out of range";
  }
  return null;
}

/**
 * Merge partial/unknown JSON from DB into a full config with defaults.
 * @param raw - Prisma row fields or API body fragment.
 */
export function normalizeRiskEngineConfig(raw: Partial<{
  likelihoodMax: number;
  impactMax: number;
  simpleBandLabels: unknown;
  simpleBandCutoffs: unknown;
  weightedBandLabels: unknown;
  weightedBandCutoffs: unknown;
}> | null | undefined): RiskEngineConfig {
  const d = DEFAULT_RISK_ENGINE_CONFIG;
  if (!raw) return { ...d, simpleBandLabels: { ...d.simpleBandLabels }, simpleBandCutoffs: { ...d.simpleBandCutoffs }, weightedBandLabels: { ...d.weightedBandLabels }, weightedBandCutoffs: { ...d.weightedBandCutoffs } };

  const simpleLabels = asRecord(raw.simpleBandLabels);
  const simpleCutoffs = asRecord(raw.simpleBandCutoffs);
  const weightedLabels = asRecord(raw.weightedBandLabels);
  const weightedCutoffs = asRecord(raw.weightedBandCutoffs);

  const likelihoodMax = clampInt(raw.likelihoodMax, 2, 10, d.likelihoodMax);
  const impactMax = clampInt(raw.impactMax, 2, 10, d.impactMax);

  const config: RiskEngineConfig = {
    likelihoodMax,
    impactMax,
    simpleBandLabels: {
      low: str(simpleLabels.low, d.simpleBandLabels.low),
      medium: str(simpleLabels.medium, d.simpleBandLabels.medium),
      high: str(simpleLabels.high, d.simpleBandLabels.high),
      critical: str(simpleLabels.critical, d.simpleBandLabels.critical),
    },
    simpleBandCutoffs: {
      low: num(simpleCutoffs.low, d.simpleBandCutoffs.low),
      medium: num(simpleCutoffs.medium, d.simpleBandCutoffs.medium),
      high: num(simpleCutoffs.high, d.simpleBandCutoffs.high),
    },
    weightedBandLabels: {
      low: str(weightedLabels.low, d.weightedBandLabels.low),
      medium: str(weightedLabels.medium, d.weightedBandLabels.medium),
      high: str(weightedLabels.high, d.weightedBandLabels.high),
      critical: str(weightedLabels.critical, d.weightedBandLabels.critical),
      severe: str(weightedLabels.severe, d.weightedBandLabels.severe),
    },
    weightedBandCutoffs: {
      low: num(weightedCutoffs.low, d.weightedBandCutoffs.low),
      medium: num(weightedCutoffs.medium, d.weightedBandCutoffs.medium),
      high: num(weightedCutoffs.high, d.weightedBandCutoffs.high),
      critical: num(weightedCutoffs.critical, d.weightedBandCutoffs.critical),
    },
  };

  // If stored cutoffs are invalid, fall back to defaults rather than erroring.
  if (validateSimpleCutoffs(config.simpleBandCutoffs)) {
    config.simpleBandCutoffs = { ...d.simpleBandCutoffs };
  }
  if (validateWeightedCutoffs(config.weightedBandCutoffs)) {
    config.weightedBandCutoffs = { ...d.weightedBandCutoffs };
  }
  return config;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
