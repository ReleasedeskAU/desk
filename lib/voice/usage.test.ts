/**
 * Voice usage ceilings + cost estimate math.
 * Run: npx tsx --test lib/voice/usage.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  _resetVoiceUsageForTests,
  checkVoiceDailySessionCeiling,
  estimateVoiceWorstCaseUsd,
  recordVoiceSessionHeartbeat,
  recordVoiceSessionStart,
  VOICE_AUDIO_DUPLEX_USD_PER_MIN,
  VOICE_MAX_SESSION_DURATION_MS,
  VOICE_MAX_SESSIONS_PER_USER_PER_DAY,
} from "./usage";

describe("voice usage ceilings", () => {
  beforeEach(() => {
    _resetVoiceUsageForTests();
  });

  it("allows sessions under the daily ceiling and blocks at the limit", () => {
    for (let i = 0; i < VOICE_MAX_SESSIONS_PER_USER_PER_DAY; i++) {
      const gate = checkVoiceDailySessionCeiling("u1");
      assert.equal(gate.allowed, true);
      recordVoiceSessionStart("u1");
    }
    const blocked = checkVoiceDailySessionCeiling("u1");
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.sessionCount, VOICE_MAX_SESSIONS_PER_USER_PER_DAY);
  });

  it("accumulates heartbeat duration", () => {
    recordVoiceSessionStart("u2");
    const u = recordVoiceSessionHeartbeat("u2", 30_000);
    assert.equal(u.durationMs, 30_000);
  });

  it("grounds worst-case USD at duplex rate × max session minutes × sessions", () => {
    const minutes = VOICE_MAX_SESSION_DURATION_MS / 60_000;
    const expected =
      VOICE_MAX_SESSIONS_PER_USER_PER_DAY *
      minutes *
      VOICE_AUDIO_DUPLEX_USD_PER_MIN;
    assert.equal(
      estimateVoiceWorstCaseUsd(VOICE_MAX_SESSIONS_PER_USER_PER_DAY),
      expected
    );
    // Sanity: ~$13.80 at current defaults (40 × 15 × 0.023).
    assert.ok(expected > 10 && expected < 20);
  });
});
