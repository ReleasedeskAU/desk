/**
 * Voice guide helpers.
 * Run: npx tsx --test lib/voice/guide-ui.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearVoiceGuide,
  getVoiceGuideState,
  isScrollPageQuery,
  parseScrollDirection,
  setVoiceGuideStatus,
  voiceGuideListHref,
  voiceRowCodeFromPath,
} from "./guide-ui";

describe("voiceGuideListHref", () => {
  it("maps detail paths to list roots", () => {
    assert.equal(voiceGuideListHref("/releases/REL-0001"), "/releases");
    assert.equal(voiceGuideListHref("/blockers/abc"), "/blockers");
    assert.equal(voiceGuideListHref("/dashboard"), "/dashboard");
  });
});

describe("voiceRowCodeFromPath", () => {
  it("extracts PREFIX-#### segments only", () => {
    assert.equal(voiceRowCodeFromPath("/releases/REL-0001"), "REL-0001");
    assert.equal(voiceRowCodeFromPath("/blockers/BLK-0010"), "BLK-0010");
    assert.equal(voiceRowCodeFromPath("/blockers/cuid123"), null);
    assert.equal(voiceRowCodeFromPath("/releases"), null);
  });
});

describe("voice guide status store", () => {
  it("sets and clears status", () => {
    clearVoiceGuide();
    setVoiceGuideStatus("Opening Releases…");
    assert.equal(getVoiceGuideState().status, "Opening Releases…");
    assert.equal(getVoiceGuideState().active, true);
    clearVoiceGuide();
    assert.equal(getVoiceGuideState().active, false);
  });
});

describe("isScrollPageQuery", () => {
  it("detects scroll requests", () => {
    assert.equal(isScrollPageQuery("scroll down"), true);
    assert.equal(isScrollPageQuery("go to the top of the page"), true);
    assert.equal(isScrollPageQuery("open releases"), false);
    assert.equal(parseScrollDirection("scroll up"), "up");
    assert.equal(parseScrollDirection("top of the page"), "top");
  });
});
