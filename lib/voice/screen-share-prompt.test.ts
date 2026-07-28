/**
 * Explain-page / screen-share prompt helpers.
 * Run: npx tsx --test lib/voice/screen-share-prompt.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearVoiceScreenSharePrompt,
  getVoiceScreenSharePrompt,
  isExplainPageQuery,
  requestVoiceScreenSharePrompt,
} from "./screen-share-prompt";

describe("isExplainPageQuery", () => {
  it("matches explain / what is on this page asks", () => {
    assert.equal(isExplainPageQuery("explain this page"), true);
    assert.equal(isExplainPageQuery("what's on this table"), true);
    assert.equal(isExplainPageQuery("walk me through this dashboard"), true);
    assert.equal(isExplainPageQuery("can you see my screen"), true);
  });

  it("does not match plain navigation", () => {
    assert.equal(isExplainPageQuery("open releases"), false);
    assert.equal(isExplainPageQuery("go to the tenth blocker"), false);
  });
});

describe("requestVoiceScreenSharePrompt", () => {
  it("activates and clears the share CTA prompt", () => {
    clearVoiceScreenSharePrompt();
    requestVoiceScreenSharePrompt("Enable screen share so I can see this page");
    assert.equal(getVoiceScreenSharePrompt().active, true);
    assert.match(getVoiceScreenSharePrompt().reason, /screen share/i);
    clearVoiceScreenSharePrompt();
    assert.equal(getVoiceScreenSharePrompt().active, false);
  });
});
