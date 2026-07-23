/**
 * User-configurable risk engine settings (Simple + Weighted thresholds/labels).
 * Simple Risk bands are an ordered list (3–6): id + label + inclusive maxScore
 * (last band maxScore is null = open-ended top). Defaults match 5/11/19 + CRITICAL.
 *
 * Per-user now (clerkUserId); shape is org-migration ready.
 * Weighted System 2 stays fixed 5 levels this pass.
 */

export type WeightedRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "SEVERE";

/** Stable band id (slug). Classifier returns this — not the display label. */
export type RiskLevel = string;

export type SimpleBand = {
  id: string;
  label: string;
  /** Inclusive upper bound; null on the last band = everything above the previous cutoff. */
  maxScore: number | null;
};

export type WeightedBandLabels = {
  low: string;
  medium: string;
  high: string;
  critical: string;
  severe: string;
};

export type WeightedBandCutoffs = {
  low: number;
  medium: number;
  high: number;
  critical: number;
};

export type RiskEngineConfig = {
  likelihoodMax: number;
  impactMax: number;
  simpleBands: SimpleBand[];
  /** When false, Weighted Risk (System 2) is off for this user — cutoffs/labels kept but inactive. */
  weightedRiskEnabled: boolean;
  weightedBandLabels: WeightedBandLabels;
  weightedBandCutoffs: WeightedBandCutoffs;
};

export const MIN_SIMPLE_BANDS = 3;
export const MAX_SIMPLE_BANDS = 6;

/** Shipped default: ≤5 / ≤11 / ≤19 / above → CRITICAL. */
export const DEFAULT_SIMPLE_BANDS: SimpleBand[] = [
  { id: "low", label: "LOW", maxScore: 5 },
  { id: "medium", label: "MEDIUM", maxScore: 11 },
  { id: "high", label: "HIGH", maxScore: 19 },
  { id: "critical", label: "CRITICAL", maxScore: null },
];

export const DEFAULT_RISK_ENGINE_CONFIG: RiskEngineConfig = {
  likelihoodMax: 5,
  impactMax: 5,
  simpleBands: DEFAULT_SIMPLE_BANDS.map((b) => ({ ...b })),
  weightedRiskEnabled: true,
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
 * Classify a Simple Risk score using ordered inclusive cutoffs.
 * @param score - likelihood × impact.
 * @param config - Engine config (defaults when omitted).
 * @returns Band id (not the display label).
 */
export function resolveSimpleRiskLevel(
  score: number,
  config: Pick<RiskEngineConfig, "simpleBands"> = DEFAULT_RISK_ENGINE_CONFIG
): RiskLevel {
  const bands = config.simpleBands?.length
    ? config.simpleBands
    : DEFAULT_RISK_ENGINE_CONFIG.simpleBands;
  for (const band of bands) {
    if (band.maxScore != null && score <= band.maxScore) return band.id;
  }
  return bands[bands.length - 1]!.id;
}

/**
 * Resolve the full Simple band object for a score.
 * @param score - likelihood × impact.
 * @param config - Engine config.
 */
export function resolveSimpleRiskBand(
  score: number,
  config: Pick<RiskEngineConfig, "simpleBands"> = DEFAULT_RISK_ENGINE_CONFIG
): SimpleBand {
  const bands = config.simpleBands?.length
    ? config.simpleBands
    : DEFAULT_RISK_ENGINE_CONFIG.simpleBands;
  const id = resolveSimpleRiskLevel(score, { simpleBands: bands });
  return bands.find((b) => b.id === id) ?? bands[bands.length - 1]!;
}

/**
 * Classify a Weighted Risk score using exclusive upper-bound cutoffs.
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
 * Display label for a Simple band id from config.
 * @param level - Band id.
 * @param config - Engine config.
 */
export function simpleRiskLevelLabel(
  level: RiskLevel,
  config: Pick<RiskEngineConfig, "simpleBands"> = DEFAULT_RISK_ENGINE_CONFIG
): string {
  const band = config.simpleBands.find((b) => b.id === level);
  return band?.label ?? level;
}

/**
 * Display label for a Weighted band key from config.
 */
export function weightedRiskLevelLabel(
  level: WeightedRiskLevel,
  config: Pick<RiskEngineConfig, "weightedBandLabels"> = DEFAULT_RISK_ENGINE_CONFIG
): string {
  const map = {
    LOW: config.weightedBandLabels.low,
    MEDIUM: config.weightedBandLabels.medium,
    HIGH: config.weightedBandLabels.high,
    CRITICAL: config.weightedBandLabels.critical,
    SEVERE: config.weightedBandLabels.severe,
  };
  return map[level];
}

/**
 * Numeric inclusive score ranges per Simple band id (for API filters).
 * @param config - Engine config with bands and scale.
 * @returns Map of band id → { gte, lte }.
 */
export function simpleBandNumericRanges(
  config: Pick<RiskEngineConfig, "simpleBands" | "likelihoodMax" | "impactMax"> = DEFAULT_RISK_ENGINE_CONFIG
): Record<string, { gte: number; lte: number }> {
  const bands = config.simpleBands;
  const scaleMax = Math.max(1, config.likelihoodMax * config.impactMax);
  const out: Record<string, { gte: number; lte: number }> = {};
  let prev = 0;
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i]!;
    const start = prev + 1;
    if (band.maxScore == null) {
      const end = Math.max(start, scaleMax);
      out[band.id] = { gte: start, lte: end };
    } else {
      const end = band.maxScore;
      out[band.id] = { gte: Math.min(start, end), lte: end };
      prev = end;
    }
  }
  return out;
}

/**
 * Human-readable score range text per Simple band id.
 * @param config - Engine config with bands and scale.
 */
export function simpleBandScoreRanges(
  config: Pick<RiskEngineConfig, "simpleBands" | "likelihoodMax" | "impactMax"> = DEFAULT_RISK_ENGINE_CONFIG
): Record<string, string> {
  const numeric = simpleBandNumericRanges(config);
  const out: Record<string, string> = {};
  for (const [id, r] of Object.entries(numeric)) {
    out[id] = r.gte >= r.lte ? String(r.lte) : `${r.gte}–${r.lte}`;
  }
  return out;
}

/**
 * 1..max axis values for likelihood/impact selects and heat-map axes (clamped 2–10).
 */
export function scaleAxisValues(max: number): number[] {
  const m = Math.max(2, Math.min(10, Math.floor(Number(max)) || 5));
  return Array.from({ length: m }, (_, i) => i + 1);
}

/** Matrix fill classes by band index (0 = lowest). Supports up to 6 bands. */
export const SIMPLE_RISK_MATRIX_FILL_BY_INDEX = [
  "bg-emerald-300",
  "bg-lime-300",
  "bg-amber-300",
  "bg-orange-400",
  "bg-rose-400",
  "bg-rose-600",
] as const;

/**
 * Matrix fill for a band id using its relative order in config (maps onto a 6-stop palette).
 * @param bandId - Band id from resolveSimpleRiskLevel.
 * @param config - Engine config.
 */
export function simpleRiskMatrixFill(
  bandId: RiskLevel,
  config: Pick<RiskEngineConfig, "simpleBands"> = DEFAULT_RISK_ENGINE_CONFIG
): string {
  const bands = config.simpleBands;
  const idx = bands.findIndex((b) => b.id === bandId);
  const i = idx < 0 ? Math.max(0, bands.length - 1) : idx;
  if (bands.length <= 1) return SIMPLE_RISK_MATRIX_FILL_BY_INDEX[0]!;
  const mapped = Math.round((i / (bands.length - 1)) * (SIMPLE_RISK_MATRIX_FILL_BY_INDEX.length - 1));
  return SIMPLE_RISK_MATRIX_FILL_BY_INDEX[
    Math.min(mapped, SIMPLE_RISK_MATRIX_FILL_BY_INDEX.length - 1)
  ]!;
}

/** @deprecated Prefer simpleRiskMatrixFill(bandId, config). Kept for default 4-band tests. */
export const SIMPLE_RISK_MATRIX_FILL: Record<string, string> = {
  low: SIMPLE_RISK_MATRIX_FILL_BY_INDEX[0],
  medium: SIMPLE_RISK_MATRIX_FILL_BY_INDEX[2],
  high: SIMPLE_RISK_MATRIX_FILL_BY_INDEX[3],
  critical: SIMPLE_RISK_MATRIX_FILL_BY_INDEX[5],
  LOW: SIMPLE_RISK_MATRIX_FILL_BY_INDEX[0],
  MEDIUM: SIMPLE_RISK_MATRIX_FILL_BY_INDEX[2],
  HIGH: SIMPLE_RISK_MATRIX_FILL_BY_INDEX[3],
  CRITICAL: SIMPLE_RISK_MATRIX_FILL_BY_INDEX[5],
};

/**
 * Validate ordered Simple bands (3–6, increasing cutoffs, last open-ended).
 * @returns Error message or null if valid.
 */
export function validateSimpleBands(bands: SimpleBand[]): string | null {
  if (!Array.isArray(bands) || bands.length < MIN_SIMPLE_BANDS || bands.length > MAX_SIMPLE_BANDS) {
    return `Simple Risk must have between ${MIN_SIMPLE_BANDS} and ${MAX_SIMPLE_BANDS} bands`;
  }
  const ids = new Set<string>();
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i]!;
    if (!b.id?.trim()) return "Each band needs a stable id";
    if (!b.label?.trim()) return "Each band needs a display label";
    if (ids.has(b.id)) return "Band ids must be unique";
    ids.add(b.id);
    const isLast = i === bands.length - 1;
    if (isLast) {
      if (b.maxScore != null) return "The top band must have no upper limit (open-ended)";
    } else {
      if (b.maxScore == null || !Number.isFinite(b.maxScore)) {
        return "Non-top bands need an inclusive upper score";
      }
      if (b.maxScore < 1 || b.maxScore > 1000) return "Band cutoffs are out of range";
      if (i > 0) {
        const prev = bands[i - 1]!.maxScore;
        if (prev == null || !(prev < b.maxScore)) {
          return "Band cutoffs must strictly increase from low to high";
        }
      }
    }
  }
  return null;
}

/** @deprecated Use validateSimpleBands. */
export function validateSimpleCutoffs(_c: unknown): string | null {
  return null;
}

/**
 * Validate weighted exclusive cutoffs are strictly increasing.
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
 * New band id for Settings "Add band".
 * @param existing - Current bands (for uniqueness).
 */
export function createSimpleBandId(existing: SimpleBand[]): string {
  let n = existing.length + 1;
  let id = `band_${n}`;
  const ids = new Set(existing.map((b) => b.id));
  while (ids.has(id)) {
    n += 1;
    id = `band_${n}`;
  }
  return id;
}

/**
 * Upgrade legacy { low, medium, high } cutoffs + labels into simpleBands.
 */
export function legacyToSimpleBands(
  labels: Record<string, unknown>,
  cutoffs: Record<string, unknown>
): SimpleBand[] | null {
  const low = num(cutoffs.low, NaN);
  const medium = num(cutoffs.medium, NaN);
  const high = num(cutoffs.high, NaN);
  if (![low, medium, high].every(Number.isFinite)) return null;
  if (!(low < medium && medium < high)) return null;
  return [
    { id: "low", label: str(labels.low, "LOW"), maxScore: low },
    { id: "medium", label: str(labels.medium, "MEDIUM"), maxScore: medium },
    { id: "high", label: str(labels.high, "HIGH"), maxScore: high },
    { id: "critical", label: str(labels.critical, "CRITICAL"), maxScore: null },
  ];
}

/**
 * Merge partial/unknown JSON from DB into a full config with defaults.
 * Accepts v2 `{ bands: SimpleBand[] }` in simpleBandCutoffs, a bare bands array,
 * top-level simpleBands, or legacy low/medium/high objects.
 */
export function normalizeRiskEngineConfig(
  raw: Partial<{
    likelihoodMax: number;
    impactMax: number;
    simpleBands: unknown;
    simpleBandLabels: unknown;
    simpleBandCutoffs: unknown;
    weightedRiskEnabled: unknown;
    weightedBandLabels: unknown;
    weightedBandCutoffs: unknown;
  }> | null | undefined
): RiskEngineConfig {
  const d = DEFAULT_RISK_ENGINE_CONFIG;
  if (!raw) {
    return {
      ...d,
      simpleBands: d.simpleBands.map((b) => ({ ...b })),
      weightedBandLabels: { ...d.weightedBandLabels },
      weightedBandCutoffs: { ...d.weightedBandCutoffs },
    };
  }

  const weightedLabels = asRecord(raw.weightedBandLabels);
  const { cutoffs: weightedCutoffs, enabled: enabledFromCutoffs } = parseWeightedCutoffs(
    raw.weightedBandCutoffs
  );
  const likelihoodMax = clampInt(raw.likelihoodMax, 2, 10, d.likelihoodMax);
  const impactMax = clampInt(raw.impactMax, 2, 10, d.impactMax);
  const weightedRiskEnabled =
    typeof raw.weightedRiskEnabled === "boolean"
      ? raw.weightedRiskEnabled
      : enabledFromCutoffs;

  let simpleBands = parseSimpleBands(raw.simpleBands, raw.simpleBandCutoffs, raw.simpleBandLabels);
  if (!simpleBands || validateSimpleBands(simpleBands)) {
    simpleBands = d.simpleBands.map((b) => ({ ...b }));
  }

  const config: RiskEngineConfig = {
    likelihoodMax,
    impactMax,
    simpleBands,
    weightedRiskEnabled,
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

  if (validateWeightedCutoffs(config.weightedBandCutoffs)) {
    config.weightedBandCutoffs = { ...d.weightedBandCutoffs };
  }
  return config;
}

/**
 * Persist weighted cutoffs + feature flag without a schema migration.
 * Shape: `{ v: 2, enabled, low, medium, high, critical }` (legacy flat object still loads).
 */
export function toPersistedWeightedCutoffsJson(
  cutoffs: WeightedBandCutoffs,
  enabled: boolean
): { v: 2; enabled: boolean } & WeightedBandCutoffs {
  return { v: 2, enabled, ...cutoffs };
}

/**
 * Shape persisted to Prisma JSON columns (compatible with legacy readers via normalize).
 */
export function toPersistedSimpleBandJson(bands: SimpleBand[]): {
  simpleBandLabels: Record<string, string>;
  simpleBandCutoffs: { v: 2; bands: SimpleBand[] };
} {
  const labels: Record<string, string> = {};
  for (const b of bands) labels[b.id] = b.label;
  // Keep classic keys when present so older tooling still sees names.
  if (bands[0]) labels.low = bands[0].label;
  if (bands[1]) labels.medium = bands[1].label;
  if (bands[2]) labels.high = bands[2].label;
  const last = bands[bands.length - 1];
  if (last) labels.critical = last.label;
  return {
    simpleBandLabels: labels,
    simpleBandCutoffs: { v: 2, bands: bands.map((b) => ({ ...b })) },
  };
}

function parseSimpleBands(
  topLevel: unknown,
  cutoffsRaw: unknown,
  labelsRaw: unknown
): SimpleBand[] | null {
  if (Array.isArray(topLevel)) {
    const parsed = coerceBandArray(topLevel);
    if (parsed) return parsed;
  }
  if (Array.isArray(cutoffsRaw)) {
    const parsed = coerceBandArray(cutoffsRaw);
    if (parsed) return parsed;
  }
  const cutoffs = asRecord(cutoffsRaw);
  if (Array.isArray(cutoffs.bands)) {
    const parsed = coerceBandArray(cutoffs.bands);
    if (parsed) return parsed;
  }
  const labels = asRecord(labelsRaw);
  return legacyToSimpleBands(labels, cutoffs);
}

function coerceBandArray(arr: unknown[]): SimpleBand[] | null {
  const bands: SimpleBand[] = [];
  for (let i = 0; i < arr.length; i++) {
    const row = arr[i];
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    const id = str(r.id, "");
    const label = str(r.label, "");
    if (!id || !label) return null;
    const isLast = i === arr.length - 1;
    let maxScore: number | null;
    if (isLast) {
      maxScore =
        r.maxScore === null || r.maxScore === undefined || r.maxScore === ""
          ? null
          : num(r.maxScore, NaN);
      if (maxScore != null && !Number.isFinite(maxScore)) maxScore = null;
    } else {
      maxScore = num(r.maxScore, NaN);
      if (!Number.isFinite(maxScore)) return null;
    }
    bands.push({ id, label, maxScore });
  }
  // Ensure last is open-ended.
  if (bands.length) bands[bands.length - 1] = { ...bands[bands.length - 1]!, maxScore: null };
  return bands;
}

function parseWeightedCutoffs(raw: unknown): {
  cutoffs: Record<string, unknown>;
  enabled: boolean;
} {
  const rec = asRecord(raw);
  const enabled =
    typeof rec.enabled === "boolean"
      ? rec.enabled
      : DEFAULT_RISK_ENGINE_CONFIG.weightedRiskEnabled;
  return { cutoffs: rec, enabled };
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
