/**
 * Reconnect backoff helpers.
 * Run: npx tsx --test lib/voice/reconnect.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VOICE_AUDIO_PROACTIVE_RECONNECT_MS,
  VOICE_RECONNECT_BASE_MS,
  VOICE_RECONNECT_MAX_MS,
  VOICE_WS_STALE_MS,
  voiceReconnectDelayMs,
} from "./reconnect";

describe("voiceReconnectDelayMs", () => {
  it("starts at base and doubles until the max cap", () => {
    assert.equal(voiceReconnectDelayMs(0), VOICE_RECONNECT_BASE_MS);
    assert.equal(voiceReconnectDelayMs(1), VOICE_RECONNECT_BASE_MS * 2);
    assert.equal(voiceReconnectDelayMs(2), VOICE_RECONNECT_BASE_MS * 4);
    assert.ok(voiceReconnectDelayMs(20) <= VOICE_RECONNECT_MAX_MS);
    assert.equal(voiceReconnectDelayMs(20), VOICE_RECONNECT_MAX_MS);
  });

  it("allows long quiet periods before stale reconnect", () => {
    assert.ok(VOICE_WS_STALE_MS >= 5 * 60_000);
  });

  it("remints audio sessions before the typical ~10 min Live cut", () => {
    assert.ok(VOICE_AUDIO_PROACTIVE_RECONNECT_MS >= 7 * 60_000);
    assert.ok(VOICE_AUDIO_PROACTIVE_RECONNECT_MS < 10 * 60_000);
  });
});
