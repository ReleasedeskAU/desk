/**
 * Spoken query normalization — ordinals and filler.
 * Run: npx tsx --test lib/voice/spoken-query.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSpokenEntityCode,
  normalizeSpokenVersion,
  parseBareOrdinal,
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

  it("maps 10th blocker and blocker 10 to ordinal 10", () => {
    const a = parseVoiceSearchIntent("open the 10th blocker");
    assert.equal(a.kind, "ordinal");
    if (a.kind === "ordinal") {
      assert.equal(a.ordinal, 10);
      assert.equal(a.entityType, "blocker");
    }
    const b = parseVoiceSearchIntent("blocker 10");
    assert.equal(b.kind, "ordinal");
    if (b.kind === "ordinal") {
      assert.equal(b.ordinal, 10);
      assert.equal(b.entityType, "blocker");
    }
    const c = parseVoiceSearchIntent("tenth blocker from blockers");
    assert.equal(c.kind, "ordinal");
    if (c.kind === "ordinal") {
      assert.equal(c.ordinal, 10);
      assert.equal(c.entityType, "blocker");
    }
  });

  it("maps REL-0001 / rel 0001 to a release code text query", () => {
    const a = parseVoiceSearchIntent("open REL-0001");
    assert.equal(a.kind, "text");
    if (a.kind === "text") {
      assert.equal(a.query, "REL-0001");
      assert.equal(a.entityType, "release");
    }
    const b = parseVoiceSearchIntent("rel 0001");
    assert.equal(b.kind, "text");
    if (b.kind === "text") {
      assert.equal(b.query, "REL-0001");
      assert.equal(b.entityType, "release");
    }
  });

  it("maps BLK-0010 / blocker 0010 to a blocker code text query", () => {
    const a = parseVoiceSearchIntent("open BLK-0010");
    assert.equal(a.kind, "text");
    if (a.kind === "text") {
      assert.equal(a.query, "BLK-0010");
      assert.equal(a.entityType, "blocker");
    }
    const b = normalizeSpokenEntityCode("blocker 0010");
    assert.equal(b?.code, "BLK-0010");
    assert.equal(b?.entityType, "blocker");
  });

  it("keeps name searches as text", () => {
    const a = parseVoiceSearchIntent("open Billing Hotfix");
    assert.equal(a.kind, "text");
    if (a.kind === "text") {
      assert.match(a.query, /Billing Hotfix/i);
    }
  });
});

describe("parseBareOrdinal", () => {
  it("parses tenth / 10th for list-context bare ordinals", () => {
    assert.equal(parseBareOrdinal("10th"), 10);
    assert.equal(parseBareOrdinal("the tenth"), 10);
    assert.equal(parseBareOrdinal("first one"), 1);
  });
});
