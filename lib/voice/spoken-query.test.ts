/**
 * Spoken query normalization — ordinals and filler.
 * Run: npx tsx --test lib/voice/spoken-query.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSpokenVersion,
  parseVoiceSearchIntent,
  stripSpokenFiller,
} from "./spoken-query";

describe("stripSpokenFiller", () => {
  it("strips go-to / page filler", () => {
    assert.equal(stripSpokenFiller("go to the checkout page"), "checkout");
    assert.equal(stripSpokenFiller("open Platform Release details"), "Platform Release");
  });
});

describe("normalizeSpokenVersion", () => {
  it("collapses spoken version tokens", () => {
    assert.equal(normalizeSpokenVersion("version 2.14.0"), "v2.14.0");
    assert.equal(normalizeSpokenVersion("v 2 14"), "v2.14");
  });
});

describe("parseVoiceSearchIntent", () => {
  it("maps first release / rel 01 to ordinal 1", () => {
    const a = parseVoiceSearchIntent("go to the first release page");
    assert.equal(a.kind, "ordinal");
    if (a.kind === "ordinal") {
      assert.equal(a.ordinal, 1);
      assert.equal(a.entityType, "release");
    }
    const b = parseVoiceSearchIntent("rel 01");
    assert.equal(b.kind, "ordinal");
    if (b.kind === "ordinal") {
      assert.equal(b.ordinal, 1);
      assert.equal(b.entityType, "release");
    }
  });

  it("keeps name searches as text", () => {
    const a = parseVoiceSearchIntent("open Billing Hotfix");
    assert.equal(a.kind, "text");
    if (a.kind === "text") {
      assert.match(a.query, /Billing Hotfix/i);
    }
  });
});
