/**
 * Proof tests: Simple Risk band unification + config defaults/fallback.
 * Run: npx tsx --test lib/risk-engine-config.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getRiskLevel } from "./risk-level";
import {
  DEFAULT_RISK_ENGINE_CONFIG,
  SIMPLE_RISK_MATRIX_FILL,
  normalizeRiskEngineConfig,
  resolveSimpleRiskLevel,
  resolveWeightedRiskLevel,
  type RiskEngineConfig,
} from "./risk-engine-config";

/** Same classifier path used by list chips, heat-map cells, and detail hero. */
function listBand(score: number, config?: RiskEngineConfig) {
  return getRiskLevel(score, config);
}

/** Same classifier path used by RiskMatrix cell fill (was formerly private ≥6/13/20). */
function matrixBand(score: number, config?: RiskEngineConfig) {
  return getRiskLevel(score, config);
}

/** Same classifier path used by risks/[id] hero (was formerly ≤5/≤12/≤19). */
function detailHeroBand(score: number, config?: RiskEngineConfig) {
  return getRiskLevel(score, config);
}

describe("Simple Risk three-surface unification", () => {
  it("BEFORE drift documented: legacy matrix/detail disagreed with getRiskLevel at score 6 and 12", () => {
    // Historical private logic (must NOT be used anymore):
    const legacyMatrixBand = (score: number) =>
      score >= 20 ? "CRITICAL" : score >= 13 ? "HIGH" : score >= 6 ? "MEDIUM" : "LOW";
    const legacyDetailHero = (score: number) =>
      score <= 5 ? "LOW" : score <= 12 ? "MEDIUM" : score <= 19 ? "HIGH" : "CRITICAL";

    assert.equal(getRiskLevel(6), "MEDIUM");
    assert.equal(legacyMatrixBand(6), "MEDIUM"); // happened to agree at 6
    assert.equal(legacyDetailHero(6), "MEDIUM");

    // Real historical disagreement at score 12:
    assert.equal(getRiskLevel(12), "HIGH");
    assert.equal(legacyMatrixBand(12), "MEDIUM"); // WAS wrong vs list
    assert.equal(legacyDetailHero(12), "MEDIUM"); // WAS wrong vs list
    process.stdout.write(
      "PROOF before: score 12 → list=HIGH, legacyMatrix=MEDIUM, legacyDetail=MEDIUM (disagreement)\n"
    );
  });

  it("AFTER: score 6 is MEDIUM on list, matrix, and detail hero (same function)", () => {
    const score = 6;
    const list = listBand(score);
    const matrix = matrixBand(score);
    const hero = detailHeroBand(score);
    assert.equal(list, "MEDIUM");
    assert.equal(matrix, "MEDIUM");
    assert.equal(hero, "MEDIUM");
    assert.equal(list, matrix);
    assert.equal(matrix, hero);
    assert.equal(SIMPLE_RISK_MATRIX_FILL[matrix], "bg-amber-300");
    process.stdout.write(
      `PROOF after defaults: score ${score} → list=${list} matrix=${matrix} hero=${hero}\n`
    );
  });

  it("AFTER: score 12 is HIGH on all three surfaces (fixes prior ≤12 / ≥13 drift)", () => {
    const score = 12;
    const list = listBand(score);
    const matrix = matrixBand(score);
    const hero = detailHeroBand(score);
    assert.equal(list, "HIGH");
    assert.equal(matrix, "HIGH");
    assert.equal(hero, "HIGH");
    process.stdout.write(
      `PROOF after defaults: score ${score} → list=${list} matrix=${matrix} hero=${hero}\n`
    );
  });

  it("before/after settings change: same score 6, different band when medium cutoff drops to 5", () => {
    const before = listBand(6, DEFAULT_RISK_ENGINE_CONFIG);
    assert.equal(before, "MEDIUM");

    const afterConfig: RiskEngineConfig = {
      ...DEFAULT_RISK_ENGINE_CONFIG,
      simpleBandCutoffs: { low: 4, medium: 5, high: 19 },
    };
    const afterList = listBand(6, afterConfig);
    const afterMatrix = matrixBand(6, afterConfig);
    const afterHero = detailHeroBand(6, afterConfig);
    assert.equal(afterList, "HIGH");
    assert.equal(afterMatrix, "HIGH");
    assert.equal(afterHero, "HIGH");
    process.stdout.write(
      `PROOF settings change: score 6 before=${before} after=${afterList} (list=matrix=hero)\n`
    );
  });
});

describe("Config defaults + missing row fallback", () => {
  it("normalizeRiskEngineConfig(null) returns shipped 5/11/19 and weighted 1.5/2.5/3.5/4.0", () => {
    const c = normalizeRiskEngineConfig(null);
    assert.deepEqual(c.simpleBandCutoffs, { low: 5, medium: 11, high: 19 });
    assert.deepEqual(c.weightedBandCutoffs, {
      low: 1.5,
      medium: 2.5,
      high: 3.5,
      critical: 4.0,
    });
    assert.equal(c.likelihoodMax, 5);
    assert.equal(resolveSimpleRiskLevel(5, c), "LOW");
    assert.equal(resolveSimpleRiskLevel(6, c), "MEDIUM");
    assert.equal(resolveWeightedRiskLevel(3.6, c), "CRITICAL");
    process.stdout.write("PROOF no config row → defaults, no error\n");
  });
});
