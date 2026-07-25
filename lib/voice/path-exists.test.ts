/**
 * Detail existence probe — silent-success regression for fake REL-001.
 * Run: npx tsx --test lib/voice/path-exists.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertVoicePathExists } from "./path-exists";

describe("assertVoicePathExists", () => {
  it("rejects /releases/REL-001 without calling fetch (hallucinated code)", async () => {
    let fetchCalled = false;
    const result = await assertVoicePathExists("/releases/REL-001", {
      fetch: async () => {
        fetchCalled = true;
        return new Response(null, { status: 200 });
      },
    });
    assert.equal(result.ok, false);
    assert.equal(fetchCalled, false);
  });

  it("accepts known synthetic release id without fetch", async () => {
    let fetchCalled = false;
    const result = await assertVoicePathExists("/releases/rel-v2140", {
      fetch: async () => {
        fetchCalled = true;
        return new Response(null, { status: 404 });
      },
    });
    assert.equal(result.ok, true);
    assert.equal(fetchCalled, false);
  });

  it("rejects unknown non-synthetic id when API returns 404", async () => {
    const result = await assertVoicePathExists("/releases/does-not-exist-xyz", {
      fetch: async () => new Response(null, { status: 404 }),
    });
    assert.equal(result.ok, false);
  });
});
