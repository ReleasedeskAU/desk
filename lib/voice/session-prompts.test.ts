/**
 * Session prompt + tool wait copy.
 * Run: npx tsx --test lib/voice/session-prompts.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildVoiceContextDigest,
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

  it("resume_continue keeps same chat without blaming network failure", () => {
    const t = voiceSessionPromptText("resume_continue");
    assert.match(t, /same conversation|prior dialogue/i);
    assert.match(t, /still here/i);
    assert.match(t, /Do not apologize for a network/i);
    assert.doesNotMatch(t, /dropped due to a network issue/i);
    assert.match(t, /Do not call any tools/i);
  });

  it("network_resume alias matches resume_continue behavior", () => {
    const a = voiceSessionPromptText("network_resume");
    const b = voiceSessionPromptText("resume_continue");
    assert.equal(a, b);
  });

  it("context_bridge includes digest and avoids first-meeting restart", () => {
    const t = voiceSessionPromptText(
      "context_bridge",
      "User: open releases\nAssistant: Opening the releases list."
    );
    assert.match(t, /could not be resumed/i);
    assert.match(t, /open releases/i);
    assert.match(t, /Do not re-introduce/i);
    assert.match(t, /Do not call any tools/i);
  });
});

describe("buildVoiceContextDigest", () => {
  it("formats recent turns and respects max chars", () => {
    const digest = buildVoiceContextDigest(
      [
        { role: "user", text: "show blockers" },
        { role: "model", text: "Here are the open blockers." },
      ],
      1_400
    );
    assert.match(digest, /User: show blockers/);
    assert.match(digest, /Assistant: Here are the open blockers/);
  });

  it("returns empty string for empty turns", () => {
    assert.equal(buildVoiceContextDigest([]), "");
  });
});

describe("voiceToolWaitNoticesForCalls", () => {
  it("maps search and navigate to wait copy", () => {
    assert.equal(voiceToolWaitNotice("search_entity"), "Searching… please wait");
    assert.equal(voiceToolWaitNotice("navigate_to"), "Navigating… please wait");
    assert.equal(
      voiceToolWaitNotice("apply_list_filters"),
      "Applying filters… please wait"
    );
    assert.deepEqual(
      voiceToolWaitNoticesForCalls(["search_entity", "navigate_to", "search_entity"]),
      ["Searching… please wait", "Navigating… please wait"]
    );
    assert.equal(
      voiceToolWaitNotice("configure_table_view"),
      "Updating table view… please wait"
    );
    assert.equal(voiceToolWaitNotice("scroll_page"), null);
    assert.equal(
      voiceToolWaitNotice("get_page_context"),
      "Reading this page… please wait"
    );
  });
});
