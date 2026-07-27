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
import {
  detailPathForEntity,
  extractNavLookupToken,
  resolveEntityNavFromHint,
} from "./resolve-nav-path";

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

describe("resolveEntityNavFromHint", () => {
  it("extracts token and resolves REL-0004 from search catalog", () => {
    assert.equal(extractNavLookupToken("/release/REL-0004"), "REL-0004");
    const hit = resolveEntityNavFromHint("/release/REL-0004");
    assert.ok(hit);
    assert.equal(hit.path, "/releases/REL-0004");
  });

  it("builds detail paths from ENTITY_HREF_PREFIX registry only", () => {
    assert.equal(detailPathForEntity("release", "REL-0004"), "/releases/REL-0004");
    assert.equal(detailPathForEntity("booking", "ENV-0001"), "/booking/ENV-0001");
    assert.equal(detailPathForEntity("unknown", "X"), null);
  });
});
