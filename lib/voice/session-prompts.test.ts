/**
 * Session prompt + tool wait copy.
 * Run: npx tsx --test lib/voice/session-prompts.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  voiceSessionPromptText,
  voiceToolWaitNotice,
  voiceToolWaitNoticesForCalls,
} from "./session-prompts";

describe("voiceSessionPromptText", () => {
  it("greet asks for a short welcome without tools", () => {
    const t = voiceSessionPromptText("greet");
    assert.match(t, /New voice session/i);
    assert.match(t, /Greet/i);
    assert.match(t, /Do not call any tools/i);
  });

  it("network resume apologizes and continues same chat", () => {
    const t = voiceSessionPromptText("network_resume");
    assert.match(t, /network/i);
    assert.match(t, /apologize|disconnected/i);
    assert.match(t, /same conversation|continue/i);
  });
});

describe("voiceToolWaitNoticesForCalls", () => {
  it("maps search and navigate to wait copy", () => {
    assert.equal(voiceToolWaitNotice("search_entity"), "Searching… please wait");
    assert.equal(voiceToolWaitNotice("navigate_to"), "Navigating… please wait");
    assert.deepEqual(
      voiceToolWaitNoticesForCalls(["search_entity", "navigate_to", "search_entity"]),
      ["Searching… please wait", "Navigating… please wait"]
    );
  });
});
