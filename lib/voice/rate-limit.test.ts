/**
 * Voice session mint cooldown — main path + cooldown edge.
 * Run: npx tsx --test lib/voice/rate-limit.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  checkVoiceSessionRateLimit,
  markVoiceSessionMinted,
  _resetVoiceSessionRateLimitForTests,
  VOICE_SESSION_COOLDOWN_MS,
} from "./rate-limit";

describe("checkVoiceSessionRateLimit", () => {
  beforeEach(() => {
    _resetVoiceSessionRateLimitForTests();
  });

  it("allows the first mint for a user", () => {
    const result = checkVoiceSessionRateLimit("user_test_1");
    assert.equal(result.allowed, true);
    assert.equal(result.retryAfterSec, undefined);
  });

  it("blocks a second mint inside the cooldown window", () => {
    markVoiceSessionMinted("user_test_2");
    const result = checkVoiceSessionRateLimit("user_test_2");
    assert.equal(result.allowed, false);
    assert.ok((result.retryAfterSec ?? 0) > 0);
    assert.ok((result.retryAfterSec ?? 0) <= Math.ceil(VOICE_SESSION_COOLDOWN_MS / 1000));
  });

  it("uses a shorter cooldown for reconnect remints", async () => {
    markVoiceSessionMinted("user_reconnect");
    const cold = checkVoiceSessionRateLimit("user_reconnect");
    assert.equal(cold.allowed, false);
    // Soft reconnect window is 2s — still blocked immediately after mint.
    const softImmediate = checkVoiceSessionRateLimit("user_reconnect", {
      reconnect: true,
    });
    assert.equal(softImmediate.allowed, false);
    await new Promise((r) => setTimeout(r, 2100));
    const softLater = checkVoiceSessionRateLimit("user_reconnect", {
      reconnect: true,
    });
    assert.equal(softLater.allowed, true);
    const coldStill = checkVoiceSessionRateLimit("user_reconnect");
    assert.equal(coldStill.allowed, false);
  });
});
