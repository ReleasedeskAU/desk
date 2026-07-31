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

  it("resolves 'rel 01' to REL-0001 code with a navigable path", async () => {
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
    assert.match(path ?? "", /REL-0001/i);
  });

  it("resolves 'open release 75' shorthand to REL-0075 search", async () => {
    mock.method(globalThis, "fetch", async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/search")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "cuid-75",
                type: "release",
                label: "REL-0075",
                sublabel: "Payment",
                href: "/releases/REL-0075",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const result = await handleSearchEntity({ query: "open release 75" });
    assert.equal(result.ok, true);
    assert.equal(result.single?.path ?? result.candidates?.[0]?.path, "/releases/REL-0075");
  });

  it("first release uses DB order so #1 is REL-0001 detail", async () => {
    mock.method(globalThis, "fetch", async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/releases")) {
        return new Response(
          JSON.stringify([
            {
              id: "cuid-b",
              releaseCode: "REL-0002",
              name: "Second",
              status: "Open",
              department: { name: "Finance" },
            },
            {
              id: "cuid-a",
              releaseCode: "REL-0001",
              name: "Kyriba UI Tweak",
              status: "Open",
              department: { name: "Finance" },
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const result = await handleSearchEntity({ query: "open the first release" });
    assert.equal(result.ok, true);
    assert.equal(result.single?.path, "/releases/REL-0001");
    assert.match(result.instruction ?? "", /IMMEDIATELY call navigate_to/i);
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
    assert.match(result.instruction, /exact codes|Speak this exact count|Do NOT invent/i);
    const c0 = result.candidates![0]!;
    assert.ok(c0.path.startsWith("/"));
    assert.equal(c0.path, c0.href);
    assert.ok(c0.refId);
    assert.equal("id" in c0, false);
    assert.match(result.instruction, /path field|Never pass refId/i);
  });

  it("lists exact Kyriba conflict codes (anti-hallucination instruction)", async () => {
    mock.method(globalThis, "fetch", async () => {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const result = await handleSearchEntity({
      query: "kyriba conflicts",
      entityType: "conflict",
    });
    assert.equal(result.ok, true);
    assert.equal(result.matchCount, 3);
    assert.match(result.instruction, /CNF-0001/);
    assert.match(result.instruction, /CNF-0016/);
    assert.match(result.instruction, /CNF-0026/);
    assert.match(result.instruction, /exactly 3/i);
    assert.doesNotMatch(result.instruction, /CNF-0002/);
  });
});
