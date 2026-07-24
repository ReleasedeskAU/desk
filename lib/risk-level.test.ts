/**
 * Risk score band chip helpers — contrast and index mapping.
 * Run: npx tsx --test lib/risk-level.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getRiskLevel,
  riskLevelChipClass,
  RISK_BAND_CHIP_BY_INDEX,
} from "./risk-level";
import {
  DEFAULT_RISK_ENGINE_CONFIG,
  normalizeRiskEngineConfig,
} from "./risk-engine-config";

describe("riskLevelChipClass", () => {
  it("maps default critical (score 25) to a dark chip with light text for contrast", () => {
    const band = getRiskLevel(25, DEFAULT_RISK_ENGINE_CONFIG);
    const chip = riskLevelChipClass(band, DEFAULT_RISK_ENGINE_CONFIG);
    assert.equal(band, "critical");
    assert.equal(chip, RISK_BAND_CHIP_BY_INDEX[5]);
    assert.match(chip, /text-white|text-\[#f8fafc\]/);
    assert.match(chip, /bg-\[#/);
  });

  it("maps unknown band id to the top (last) stop rather than crashing", () => {
    const chip = riskLevelChipClass("not-a-band", DEFAULT_RISK_ENGINE_CONFIG);
    assert.equal(chip, RISK_BAND_CHIP_BY_INDEX[5]);
  });

  it("stretches a 3-band config across the full 6-stop palette", () => {
    const config = normalizeRiskEngineConfig({
      simpleBands: [
        { id: "low", label: "LOW", maxScore: 8 },
        { id: "mid", label: "MID", maxScore: 16 },
        { id: "high", label: "HIGH", maxScore: null },
      ],
    });
    const low = riskLevelChipClass("low", config);
    const high = riskLevelChipClass("high", config);
    assert.equal(low, RISK_BAND_CHIP_BY_INDEX[0]);
    assert.equal(high, RISK_BAND_CHIP_BY_INDEX[5]);
  });
});
