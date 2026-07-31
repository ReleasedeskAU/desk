/**
 * Filter history + manager helper handlers (client-side pieces).
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  clearVoiceFilterHistory,
  peekVoiceFilterHistory,
  popVoiceFilterHistory,
  pushVoiceFilterHistory,
} from "./filter-history";
import { handleUndoFilters, handleCopyVisibleCodes } from "./handlers/manager-tools";
import { setVoiceAppContext } from "./app-context";
import { isVoiceWriteActionType, voiceWriteActionTypesList } from "./action-types";

describe("voice filter history", () => {
  beforeEach(() => clearVoiceFilterHistory());

  it("pushes and pops previous href", () => {
    pushVoiceFilterHistory("/releases");
    pushVoiceFilterHistory("/releases?dept=x");
    assert.equal(peekVoiceFilterHistory(), "/releases?dept=x");
    assert.equal(popVoiceFilterHistory(), "/releases?dept=x");
    assert.equal(popVoiceFilterHistory(), "/releases");
    assert.equal(popVoiceFilterHistory(), null);
  });
});

describe("handleUndoFilters", () => {
  beforeEach(() => clearVoiceFilterHistory());

  it("restores previous href via push", async () => {
    pushVoiceFilterHistory("/releases?dept=finance");
    const pushed: string[] = [];
    const result = await handleUndoFilters(
      {},
      {
        push: (href) => {
          pushed.push(href);
        },
        getCurrentHref: () => "/releases?dept=finance&hasBlockers=1",
      }
    );
    assert.equal(result.ok, true);
    assert.deepEqual(pushed, ["/releases?dept=finance"]);
  });

  it("fails when empty", async () => {
    const result = await handleUndoFilters({}, { push: () => {} });
    assert.equal(result.ok, false);
  });
});

describe("handleCopyVisibleCodes", () => {
  beforeEach(() => setVoiceAppContext(null));

  it("returns codes from APP_CONTEXT", async () => {
    setVoiceAppContext({
      page: "/releases",
      entityType: "release",
      visible: [
        { code: "REL-0001", label: "REL-0001 — A", path: "/releases/REL-0001" },
        { code: "REL-0009", label: "REL-0009 — B", path: "/releases/REL-0009" },
      ],
    });
    const result = await handleCopyVisibleCodes({});
    assert.equal(result.ok, true);
    assert.deepEqual(result.codes, ["REL-0001", "REL-0009"]);
  });
});

describe("voice write action types", () => {
  it("includes blocker and conflict updates", () => {
    assert.equal(isVoiceWriteActionType("update_blocker"), true);
    assert.equal(isVoiceWriteActionType("update_conflict"), true);
    assert.match(voiceWriteActionTypesList(), /update_blocker/);
  });
});
