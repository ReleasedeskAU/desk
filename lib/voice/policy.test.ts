/**
 * Voice ban + daily minutes access decisions.
 * Run: npx tsx --test lib/voice/policy.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateVoiceAccess } from "./policy";

describe("evaluateVoiceAccess", () => {
  it("allows users with no policy", () => {
    const r = evaluateVoiceAccess(null, 12);
    assert.equal(r.allowed, true);
    assert.equal(r.banned, false);
  });

  it("blocks banned users even under the minutes limit", () => {
    const r = evaluateVoiceAccess(
      { banned: true, dailyMinutesLimit: 60 },
      5
    );
    assert.equal(r.allowed, false);
    assert.equal(r.code, "voice_banned");
  });

  it("blocks when daily minutes are exhausted", () => {
    const r = evaluateVoiceAccess(
      { banned: false, dailyMinutesLimit: 30 },
      30
    );
    assert.equal(r.allowed, false);
    assert.equal(r.code, "daily_minutes_ceiling");
  });

  it("allows under a personal minutes cap", () => {
    const r = evaluateVoiceAccess(
      { banned: false, dailyMinutesLimit: 30 },
      12.5
    );
    assert.equal(r.allowed, true);
  });

  it("treats null dailyMinutesLimit as unlimited (sessions ceilings elsewhere)", () => {
    const r = evaluateVoiceAccess(
      { banned: false, dailyMinutesLimit: null },
      999
    );
    assert.equal(r.allowed, true);
  });
});
