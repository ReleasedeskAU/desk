/**
 * search_entity handler — empty query edge; wires to /api/search like GlobalSearch.
 * Run: npx tsx --test lib/voice/handlers/search.test.ts
 */
import { describe, it, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleSearchEntity } from "./search";

describe("handleSearchEntity", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("rejects empty query without treating it as a successful zero-result search", async () => {
    const result = await handleSearchEntity({ query: "   " });
    assert.equal(result.ok, false);
    assert.equal(result.matchCount, 0);
    assert.match(result.reason ?? "", /query/i);
  });

  it("resolves 'rel 01' / first release as ordinal #1 with a navigable path", async () => {
    mock.method(globalThis, "fetch", async () => {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const result = await handleSearchEntity({ query: "go to rel 01 page" });
    assert.equal(result.ok, true);
    assert.ok(result.matchCount >= 1);
    const path = result.single?.path ?? result.candidates?.[0]?.path;
    assert.ok(path?.startsWith("/releases/"));
    assert.match(result.actionLine, /#1|1 match|Release/i);
  });

  it("resolves spoken 'env 001' to /booking/ENV-0001", async () => {
    mock.method(globalThis, "fetch", async () => {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const result = await handleSearchEntity({ query: "env 001" });
    assert.equal(result.ok, true);
    assert.ok(result.matchCount >= 1);
    const path = result.single?.path ?? result.candidates?.[0]?.path;
    assert.equal(path, "/booking/ENV-0001");
  });

  it("returns candidates (not auto-navigate) when API yields multiple matches", async () => {
    mock.method(globalThis, "fetch", async () => {
      return new Response(
        JSON.stringify({
          results: [
            {
              id: "a",
              type: "release",
              label: "Checkout",
              sublabel: "x",
              href: "/releases/REL-A",
            },
            {
              id: "b",
              type: "release",
              label: "Checkup",
              sublabel: "y",
              href: "/releases/REL-B",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const result = await handleSearchEntity({ query: "check" });
    assert.equal(result.ok, true);
    assert.ok((result.matchCount ?? 0) >= 2);
    assert.ok(result.candidates && result.candidates.length >= 2);
    assert.equal(result.single, undefined);
    assert.match(result.instruction, /Do NOT auto-select/i);
    const c0 = result.candidates![0]!;
    assert.ok(c0.path.startsWith("/"));
    assert.equal(c0.path, c0.href);
    assert.ok(c0.refId);
    assert.equal("id" in c0, false);
    assert.match(result.instruction, /path field|Never pass refId/i);
  });
});
