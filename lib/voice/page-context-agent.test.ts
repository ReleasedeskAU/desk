/**
 * Page-context agent + get_page_context handler.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  formatPageContextSpeechInstruction,
  isPageDataQuery,
  voicePageContextBrief,
} from "./page-context-agent";
import { setVoiceAppContext } from "./app-context";
import { handleGetPageContext } from "./handlers/page-context";

describe("isPageDataQuery", () => {
  it("matches filtered / names / ids asks", () => {
    assert.equal(isPageDataQuery("tell me the filtered release names and ids"), true);
    assert.equal(isPageDataQuery("what is showing on this list"), true);
    assert.equal(isPageDataQuery("how many releases are filtered"), true);
    assert.equal(isPageDataQuery("list the visible releases"), true);
  });

  it("does not match unrelated chatter", () => {
    assert.equal(isPageDataQuery("go to blockers"), false);
    assert.equal(isPageDataQuery("approve APR-0001"), false);
  });
});

describe("voicePageContextBrief", () => {
  it("mentions get_page_context and Release Desk branding", () => {
    const brief = voicePageContextBrief();
    assert.match(brief, /get_page_context/);
    assert.match(brief, /totalCount/);
    assert.match(brief, /Release Desk/);
    assert.doesNotMatch(brief, /built by Google/i);
  });
});

describe("handleGetPageContext", () => {
  beforeEach(() => {
    setVoiceAppContext(null);
  });
  afterEach(() => {
    setVoiceAppContext(null);
  });

  it("returns on-screen rows as ground truth", async () => {
    setVoiceAppContext({
      page: "/releases",
      entityType: "release",
      note: "filtered",
      visible: [
        {
          code: "REL-0001",
          label: "REL-0001 — Kyriba UI Tweak",
          path: "/releases/REL-0001",
        },
        {
          code: "REL-0009",
          label: "REL-0009 — Oracle Report Fix",
          path: "/releases/REL-0009",
        },
      ],
    });

    const result = await handleGetPageContext(
      {},
      {
        push: () => {},
        getCurrentHref: () =>
          "/releases?dept=cmr348ozh00a1x8dkz37q2g4a&hasBlockers=1",
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.totalCount, 2);
    assert.equal(result.count, 2);
    assert.equal(result.rows?.[0]?.code, "REL-0001");
    assert.match(result.query ?? "", /hasBlockers=1/);
    assert.match(result.instruction, /REL-0001/);
    assert.match(result.instruction, /do not invent/i);
  });

  it("reports totalCount from the page even when the sample is capped", async () => {
    const many = Array.from({ length: 80 }, (_, i) => {
      const n = String(i + 1).padStart(4, "0");
      return {
        code: `REL-${n}`,
        label: `REL-${n} — Item`,
        path: `/releases/REL-${n}`,
      };
    });
    setVoiceAppContext({
      page: "/releases",
      entityType: "release",
      visible: many,
      totalCount: 80,
    });
    const result = await handleGetPageContext(
      {},
      { push: () => {}, getCurrentHref: () => "/releases" }
    );
    assert.equal(result.ok, true);
    assert.equal(result.totalCount, 80);
    assert.equal(result.count, 80);
    assert.equal(result.sampleCount, 40);
    assert.equal(result.rows?.length, 40);
    assert.match(result.actionLine ?? "", /80 total/);
    assert.match(result.instruction, /totalCount=80/);
  });

  it("reports empty table without inventing rows", async () => {
    setVoiceAppContext({
      page: "/releases",
      entityType: "release",
      note: "filtered",
      visible: [],
      totalCount: 0,
    });
    const result = await handleGetPageContext(
      {},
      { push: () => {}, getCurrentHref: () => "/releases?dept=x" }
    );
    assert.equal(result.ok, true);
    assert.equal(result.totalCount, 0);
    assert.match(result.instruction, /empty/i);
  });
});

describe("formatPageContextSpeechInstruction", () => {
  it("includes exact codes and totalCount", () => {
    const text = formatPageContextSpeechInstruction({
      page: "/releases",
      href: "/releases",
      entityType: "release",
      totalCount: 1,
      count: 1,
      rows: [
        {
          index: 1,
          code: "REL-0001",
          label: "REL-0001 — Demo",
          path: "/releases/REL-0001",
        },
      ],
      query: "hasBlockers=1",
      updatedAt: Date.now(),
    });
    assert.match(text, /REL-0001/);
    assert.match(text, /totalCount=1/);
    assert.match(text, /hasBlockers=1/);
  });
});
