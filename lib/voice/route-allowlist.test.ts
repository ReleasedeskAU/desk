/**
 * Voice route allowlist — main path + rejection edge.
 * Run: npx tsx --test lib/voice/route-allowlist.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedVoicePath,
  normalizeVoicePath,
  VOICE_STATIC_ROUTES,
} from "./route-allowlist";

describe("isAllowedVoicePath", () => {
  it("allows dashboard and risk list from nav, and release detail patterns", () => {
    assert.equal(isAllowedVoicePath("/dashboard"), true);
    assert.equal(isAllowedVoicePath("/risks"), true);
    assert.ok(VOICE_STATIC_ROUTES.includes("/risks"));
    assert.equal(isAllowedVoicePath("/releases/REL-001"), true);
  });

  it("rejects hallucinated and unsafe paths", () => {
    assert.equal(isAllowedVoicePath("/not-a-real-page"), false);
    assert.equal(isAllowedVoicePath("/dev/voice-probe"), false);
    assert.equal(isAllowedVoicePath("/releases/../settings"), false);
    assert.equal(normalizeVoicePath("/releases/../settings"), null);
  });
});
