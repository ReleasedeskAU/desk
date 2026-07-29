/**
 * Shared ⌘K / API search strengthening.
 * Run: npx tsx --test lib/search-strengthen.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SearchResult } from "@/lib/dummy-data";
import {
  containsAnyKey,
  rankSearchResults,
  strengthenSearchKeys,
} from "./search-strengthen";

describe("strengthenSearchKeys", () => {
  it("maps release 75 to REL-0075 and explains it", () => {
    const { plan, keys, interpreted } = strengthenSearchKeys("release 75");
    assert.equal(plan.primaryQuery, "REL-0075");
    assert.ok(keys.some((k) => /REL-0075/i.test(k)));
    assert.match(interpreted ?? "", /REL-0075/);
  });

  it("extracts multi-term keys for vague queries", () => {
    const { keys, interpreted } = strengthenSearchKeys(
      "payment release that is blocked"
    );
    assert.ok(keys.some((k) => /payment/i.test(k)));
    assert.ok(keys.some((k) => /blocked/i.test(k)));
    assert.match(interpreted ?? "", /Matching/);
  });
});

describe("containsAnyKey", () => {
  it("builds contains clauses per key", () => {
    const clauses = containsAnyKey("name", ["a", "b"]);
    assert.deepEqual(clauses, [
      { name: { contains: "a" } },
      { name: { contains: "b" } },
    ]);
  });
});

describe("rankSearchResults", () => {
  it("prefers the code-matching row", () => {
    const { plan } = strengthenSearchKeys("REL-0075");
    const rows: SearchResult[] = [
      {
        id: "1",
        type: "release",
        label: "REL-0001 — Other",
        sublabel: "",
        href: "/releases/REL-0001",
      },
      {
        id: "2",
        type: "release",
        label: "REL-0075 — Payment",
        sublabel: "",
        href: "/releases/REL-0075",
      },
    ];
    const ranked = rankSearchResults(rows, plan, 5);
    assert.equal(ranked[0]?.href, "/releases/REL-0075");
  });
});
