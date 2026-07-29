/**
 * Voice context agent — plan, retrieve, session memory.
 * Run: npx tsx --test lib/voice/context-agent/*.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { SearchResult } from "@/lib/dummy-data";
import {
  clearVoiceSearchCache,
  clearVoiceSessionMemory,
  extractVoiceSearchTerms,
  formatVoiceSessionMemoryHint,
  isVoicePronounQuery,
  planVoiceContextQuery,
  rememberVoiceEntity,
  resolveVoicePronoun,
  retrieveVoiceContext,
  scoreVoiceSearchHit,
} from "./index";

describe("planVoiceContextQuery", () => {
  it("maps release 75 shorthand to REL-0075 primary", () => {
    const plan = planVoiceContextQuery("open release 75");
    assert.equal(plan.primaryQuery, "REL-0075");
    assert.equal(plan.entityType, "release");
    assert.equal(plan.pronounRef, false);
  });

  it("expands multi-term vague queries into variants", () => {
    const plan = planVoiceContextQuery("payment release that is blocked");
    assert.equal(plan.entityType, "release");
    assert.ok(plan.terms.includes("payment"));
    assert.ok(plan.terms.includes("blocked"));
    assert.ok(plan.variants.length >= 1);
  });

  it("flags pronoun queries", () => {
    assert.equal(isVoicePronounQuery("that one"), true);
    assert.equal(isVoicePronounQuery("the same release"), true);
    const plan = planVoiceContextQuery("open that");
    assert.equal(plan.pronounRef, true);
  });

  it("pads bare digit using entityType (LLM search_entity query=5)", () => {
    const plan = planVoiceContextQuery("5", "blocker");
    assert.equal(plan.primaryQuery, "BLK-0005");
    assert.equal(plan.entityType, "blocker");
  });
});

describe("extractVoiceSearchTerms", () => {
  it("drops stop words and entity type words", () => {
    const terms = extractVoiceSearchTerms("the payment release that is blocked");
    assert.deepEqual(terms.sort(), ["blocked", "payment"].sort());
  });
});

describe("session memory", () => {
  beforeEach(() => {
    clearVoiceSessionMemory();
  });

  it("remembers and resolves pronouns", () => {
    rememberVoiceEntity({
      path: "/releases/REL-0075",
      label: "REL-0075 — Payment",
      type: "release",
      code: "REL-0075",
    });
    const hit = resolveVoicePronoun("release");
    assert.equal(hit?.code, "REL-0075");
    const hint = formatVoiceSessionMemoryHint();
    assert.match(hint ?? "", /SESSION_MEMORY/);
    assert.match(hint ?? "", /REL-0075/);
  });
});

describe("retrieveVoiceContext", () => {
  beforeEach(() => {
    clearVoiceSessionMemory();
    clearVoiceSearchCache();
  });

  it("returns memory hit for pronouns without calling search", () => {
    rememberVoiceEntity({
      path: "/blockers/BLK-0010",
      label: "BLK-0010",
      type: "blocker",
      code: "BLK-0010",
    });
    const plan = planVoiceContextQuery("that blocker");
    let searchCalls = 0;
    const retrieved = retrieveVoiceContext(plan, {
      searchFn: () => {
        searchCalls += 1;
        return [];
      },
    });
    assert.equal(retrieved.fromMemory, true);
    assert.equal(searchCalls, 0);
    assert.equal(retrieved.results[0]?.href, "/blockers/BLK-0010");
  });

  it("ranks multi-term hits and caches repeats", () => {
    const catalog: SearchResult[] = [
      {
        id: "a",
        type: "release",
        label: "REL-0001 — Other",
        sublabel: "Open",
        href: "/releases/REL-0001",
      },
      {
        id: "b",
        type: "release",
        label: "REL-0042 — Payment Fix",
        sublabel: "Blocked · Finance",
        href: "/releases/REL-0042",
      },
    ];
    const plan = planVoiceContextQuery("payment release blocked");
    const searchFn = (q: string) =>
      catalog.filter((r) =>
        `${r.label} ${r.sublabel}`.toLowerCase().includes(q.toLowerCase()) ||
        plan.terms.some((t) =>
          `${r.label} ${r.sublabel}`.toLowerCase().includes(t)
        )
      );

    const first = retrieveVoiceContext(plan, { searchFn });
    assert.ok(first.results.length >= 1);
    assert.equal(first.results[0]?.href, "/releases/REL-0042");
    assert.equal(first.cacheHit, false);

    const second = retrieveVoiceContext(plan, {
      searchFn: () => {
        throw new Error("should use cache");
      },
    });
    assert.equal(second.cacheHit, true);
    assert.equal(second.results[0]?.href, "/releases/REL-0042");
  });

  it("scores exact code higher than partial name", () => {
    const plan = planVoiceContextQuery("REL-0042");
    const a: SearchResult = {
      id: "1",
      type: "release",
      label: "REL-0001 — Payment",
      sublabel: "",
      href: "/releases/REL-0001",
    };
    const b: SearchResult = {
      id: "2",
      type: "release",
      label: "REL-0042 — Other",
      sublabel: "",
      href: "/releases/REL-0042",
    };
    assert.ok(scoreVoiceSearchHit(b, plan) > scoreVoiceSearchHit(a, plan));
  });
});
