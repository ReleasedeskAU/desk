/**
 * performVoiceRouteChange / spoken navigate intent.
 * Run: npx tsx --test lib/voice/perform-route-change.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSpokenNavigateIntent } from "./perform-route-change";

describe("isSpokenNavigateIntent", () => {
  it("matches clear sidebar open requests", () => {
    assert.equal(isSpokenNavigateIntent("go to blockers"), true);
    assert.equal(isSpokenNavigateIntent("open the blockers page"), true);
    assert.equal(isSpokenNavigateIntent("navigate to releases"), true);
  });

  it("does not steal ordinal detail opens", () => {
    assert.equal(isSpokenNavigateIntent("open the first blocker"), false);
    assert.equal(isSpokenNavigateIntent("10th release"), false);
  });
});
