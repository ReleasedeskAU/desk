/**
 * Vendor-neutral public voice copy.
 * Run: npx tsx --test lib/voice/public-branding.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeVoicePublicMessage,
  VOICE_PRODUCT_NAME,
} from "./public-branding";

describe("sanitizeVoicePublicMessage", () => {
  it("rewrites billing / credit exhaustion without naming the provider", () => {
    const out = sanitizeVoicePublicMessage(
      "Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects"
    );
    assert.match(out, /Release Desk|temporarily unavailable/i);
    assert.doesNotMatch(out, /Gemini|Google|ai\.studio/i);
  });

  it("keeps ordinary operational errors readable", () => {
    assert.match(
      sanitizeVoicePublicMessage("Voice session rate limit — try again shortly (retry in ~2s)"),
      /rate limit/i
    );
    assert.match(
      sanitizeVoicePublicMessage("Voice WebSocket closed before setup completed"),
      /WebSocket closed before setup/i
    );
  });

  it("scrubs vendor names from mixed messages", () => {
    const out = sanitizeVoicePublicMessage("Gemini Live session mint failed");
    assert.doesNotMatch(out, /Gemini/i);
    assert.match(out, /voice/i);
  });
});

describe("VOICE_PRODUCT_NAME", () => {
  it("is Release Desk branded", () => {
    assert.equal(VOICE_PRODUCT_NAME, "Release Desk Voice");
  });
});
