/**
 * Proof tests: dynamic Simple Risk bands (3–6) + legacy upgrade + Weighted defaults.
 * Run: npx tsx --test lib/risk-engine-config.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getRiskLevel } from "./risk-level";
import {
  DEFAULT_RISK_ENGINE_CONFIG,
  legacyToSimpleBands,
  normalizeRiskEngineConfig,
  resolveSimpleRiskLevel,
  resolveWeightedRiskLevel,
  toPersistedWeightedCutoffsJson,
  simpleBandScoreRanges,
  simpleBandNumericRanges,
  simpleRiskLevelLabel,
  simpleRiskMatrixFill,
  validateSimpleBands,
  type RiskEngineConfig,
  type SimpleBand,
} from "./risk-engine-config";

/** Same classifier path used by list chips, heat-map cells, and detail hero. */
function listBand(score: number, config?: RiskEngineConfig) {
  return getRiskLevel(score, config);
}
function matrixBand(score: number, config?: RiskEngineConfig) {
  return getRiskLevel(score, config);
}
function heroBand(score: number, config?: RiskEngineConfig) {
  return getRiskLevel(score, config);
}

describe("Simple Risk three-surface unification", () => {
  it("AFTER: score 6 is MEDIUM on list, matrix, and detail hero (same function)", () => {
    const list = listBand(6);
    const matrix = matrixBand(6);
    const hero = heroBand(6);
    assert.equal(list, "medium");
    assert.equal(matrix, "medium");
    assert.equal(hero, "medium");
    assert.equal(simpleRiskMatrixFill(matrix), "bg-amber-300");
    process.stdout.write("PROOF after defaults: score 6 → list=medium matrix=medium hero=medium\n");
  });

  it("AFTER: score 12 is HIGH on all three surfaces", () => {
    assert.equal(listBand(12), "high");
    assert.equal(matrixBand(12), "high");
    assert.equal(heroBand(12), "high");
    process.stdout.write("PROOF after defaults: score 12 → list=high matrix=high hero=high\n");
  });

  it("before/after settings change: same score 6, different band when medium cutoff drops to 5", () => {
    const before = listBand(6, DEFAULT_RISK_ENGINE_CONFIG);
    const afterConfig: RiskEngineConfig = {
      ...DEFAULT_RISK_ENGINE_CONFIG,
      simpleBands: [
        { id: "low", label: "LOW", maxScore: 4 },
        { id: "medium", label: "MEDIUM", maxScore: 5 },
        { id: "high", label: "HIGH", maxScore: 19 },
        { id: "critical", label: "CRITICAL", maxScore: null },
      ],
    };
    const afterList = listBand(6, afterConfig);
    assert.equal(before, "medium");
    assert.equal(afterList, "high");
    assert.equal(matrixBand(6, afterConfig), "high");
    assert.equal(heroBand(6, afterConfig), "high");
    process.stdout.write("PROOF settings change: score 6 before=medium after=high\n");
  });
});

describe("Dynamic bands + legacy normalize", () => {
  it("normalizeRiskEngineConfig(null) returns shipped 5/11/19 bands and weighted defaults", () => {
    const c = normalizeRiskEngineConfig(null);
    assert.equal(c.simpleBands.length, 4);
    assert.deepEqual(
      c.simpleBands.map((b) => ({ id: b.id, maxScore: b.maxScore })),
      [
        { id: "low", maxScore: 5 },
        { id: "medium", maxScore: 11 },
        { id: "high", maxScore: 19 },
        { id: "critical", maxScore: null },
      ]
    );
    assert.equal(c.likelihoodMax, 5);
    assert.equal(resolveSimpleRiskLevel(5, c), "low");
    assert.equal(resolveSimpleRiskLevel(6, c), "medium");
    assert.equal(resolveWeightedRiskLevel(3.6, c), "CRITICAL");
    process.stdout.write("PROOF no config row → defaults, no error\n");
  });

  it("legacy low/medium/high JSON upgrades to simpleBands with custom critical label", () => {
    const c = normalizeRiskEngineConfig({
      likelihoodMax: 5,
      impactMax: 5,
      simpleBandLabels: {
        low: "LOW",
        medium: "MEDIUM",
        high: "HIGH",
        critical: "EXTREME",
      },
      simpleBandCutoffs: { low: 5, medium: 11, high: 19 },
    });
    assert.equal(c.simpleBands.length, 4);
    assert.equal(simpleRiskLevelLabel("critical", c), "EXTREME");
    assert.equal(resolveSimpleRiskLevel(25, c), "critical");
  });

  it("legacyToSimpleBands returns null on invalid cutoffs", () => {
    assert.equal(legacyToSimpleBands({}, { low: 10, medium: 5, high: 19 }), null);
  });

  it("simpleRiskLevelLabel uses custom critical text (e.g. EXTREME) for list display", () => {
    const c = normalizeRiskEngineConfig({
      ...DEFAULT_RISK_ENGINE_CONFIG,
      simpleBands: DEFAULT_RISK_ENGINE_CONFIG.simpleBands.map((b) =>
        b.id === "critical" ? { ...b, label: "EXTREME" } : { ...b }
      ),
    });
    assert.equal(simpleRiskLevelLabel("critical", c), "EXTREME");
    assert.equal(simpleRiskLevelLabel("high", c), "HIGH");
  });

  it("simpleBandScoreRanges follow cutoffs and scale max", () => {
    const ranges = simpleBandScoreRanges(DEFAULT_RISK_ENGINE_CONFIG);
    assert.equal(ranges.low, "1–5");
    assert.equal(ranges.medium, "6–11");
    assert.equal(ranges.high, "12–19");
    assert.equal(ranges.critical, "20–25");
  });

  it("simpleBandNumericRanges match score ranges used by ?band= filters", () => {
    const n = simpleBandNumericRanges(DEFAULT_RISK_ENGINE_CONFIG);
    assert.deepEqual(n.low, { gte: 1, lte: 5 });
    assert.deepEqual(n.critical, { gte: 20, lte: 25 });
  });

  it("normalize fail-opens invalid bands to defaults (PUT must validate first)", () => {
    const wiped = normalizeRiskEngineConfig({
      ...DEFAULT_RISK_ENGINE_CONFIG,
      simpleBands: [
        { id: "a", label: "CUSTOM_A", maxScore: 10 },
        { id: "b", label: "CUSTOM_B", maxScore: 5 },
        { id: "c", label: "CUSTOM_C", maxScore: null },
      ],
    });
    assert.equal(
      wiped.simpleBands.map((b) => b.label).join("|"),
      "LOW|MEDIUM|HIGH|CRITICAL"
    );
    assert.match(
      validateSimpleBands([
        { id: "a", label: "CUSTOM_A", maxScore: 10 },
        { id: "b", label: "CUSTOM_B", maxScore: 5 },
        { id: "c", label: "CUSTOM_C", maxScore: null },
      ]) ?? "",
      /strictly increase/
    );
  });

  it("3-band classify: ≤5 low, ≤15 medium, above high", () => {
    const bands: SimpleBand[] = [
      { id: "low", label: "LOW", maxScore: 5 },
      { id: "medium", label: "MEDIUM", maxScore: 15 },
      { id: "high", label: "HIGH", maxScore: null },
    ];
    assert.equal(validateSimpleBands(bands), null);
    const c: RiskEngineConfig = { ...DEFAULT_RISK_ENGINE_CONFIG, simpleBands: bands };
    assert.equal(resolveSimpleRiskLevel(5, c), "low");
    assert.equal(resolveSimpleRiskLevel(6, c), "medium");
    assert.equal(resolveSimpleRiskLevel(15, c), "medium");
    assert.equal(resolveSimpleRiskLevel(16, c), "high");
  });

  it("5-band classify matches acceptance-style ladder", () => {
    const bands: SimpleBand[] = [
      { id: "vlow", label: "VERY LOW", maxScore: 2 },
      { id: "low", label: "LOW", maxScore: 5 },
      { id: "medium", label: "MEDIUM", maxScore: 10 },
      { id: "high", label: "HIGH", maxScore: 15 },
      { id: "vhigh", label: "VERY HIGH", maxScore: 20 },
      { id: "critical", label: "CRITICAL", maxScore: null },
    ];
    assert.equal(validateSimpleBands(bands), null);
    const c: RiskEngineConfig = { ...DEFAULT_RISK_ENGINE_CONFIG, simpleBands: bands };
    assert.equal(resolveSimpleRiskLevel(2, c), "vlow");
    assert.equal(resolveSimpleRiskLevel(5, c), "low");
    assert.equal(resolveSimpleRiskLevel(10, c), "medium");
    assert.equal(resolveSimpleRiskLevel(15, c), "high");
    assert.equal(resolveSimpleRiskLevel(20, c), "vhigh");
    assert.equal(resolveSimpleRiskLevel(21, c), "critical");
    assert.equal(simpleRiskLevelLabel("vlow", c), "VERY LOW");
  });

  it("weightedRiskEnabled persists via cutoffs v2 wrapper and defaults on", () => {
    assert.equal(DEFAULT_RISK_ENGINE_CONFIG.weightedRiskEnabled, true);
    const off = normalizeRiskEngineConfig({
      ...DEFAULT_RISK_ENGINE_CONFIG,
      weightedRiskEnabled: false,
      weightedBandCutoffs: toPersistedWeightedCutoffsJson(
        DEFAULT_RISK_ENGINE_CONFIG.weightedBandCutoffs,
        false
      ),
    });
    assert.equal(off.weightedRiskEnabled, false);
    const fromJsonOnly = normalizeRiskEngineConfig({
      weightedBandCutoffs: {
        v: 2,
        enabled: false,
        low: 1.5,
        medium: 2.5,
        high: 3.5,
        critical: 4.0,
      },
    });
    assert.equal(fromJsonOnly.weightedRiskEnabled, false);
    assert.equal(fromJsonOnly.weightedBandCutoffs.low, 1.5);
  });

  it("validateSimpleBands rejects fewer than 3 or non-increasing cutoffs", () => {
    assert.match(
      validateSimpleBands([
        { id: "a", label: "A", maxScore: 5 },
        { id: "b", label: "B", maxScore: null },
      ]) ?? "",
      /between 3 and 6/
    );
    assert.match(
      validateSimpleBands([
        { id: "a", label: "A", maxScore: 10 },
        { id: "b", label: "B", maxScore: 5 },
        { id: "c", label: "C", maxScore: null },
      ]) ?? "",
      /strictly increase/
    );
  });
});
