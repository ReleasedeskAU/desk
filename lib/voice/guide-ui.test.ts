/**
 * Voice guide helpers.
 * Run: npx tsx --test lib/voice/guide-ui.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canScrollFurther,
  clearVoiceGuide,
  elementCanScrollY,
  getVoiceGuideState,
  isMajorScrollport,
  isScrollPageQuery,
  parseScrollDirection,
  setVoiceGuideStatus,
  voiceGuideListHref,
  voiceRowCodeFromPath,
  voiceScrollDurationMs,
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
    assert.equal(isScrollPageQuery("go all the way down"), true);
    assert.equal(parseScrollDirection("scroll up"), "up");
    assert.equal(parseScrollDirection("top of the page"), "top");
    assert.equal(parseScrollDirection("scroll to the bottom"), "bottom");
    assert.equal(parseScrollDirection("scroll down"), "down");
  });
});

describe("canScrollFurther", () => {
  it("keeps scrolling while the scrollport has room", () => {
    assert.equal(canScrollFurther(0, 4000, 800, "down"), true);
    assert.equal(canScrollFurther(0, 4000, 800, "up"), false);
    assert.equal(canScrollFurther(3200, 4000, 800, "down"), false);
    assert.equal(canScrollFurther(3200, 4000, 800, "up"), true);
    assert.equal(canScrollFurther(3200, 4000, 800, "top"), true);
    assert.equal(canScrollFurther(0, 4000, 800, "bottom"), true);
  });

  it("skips scrollports with nothing to scroll so the page takes over", () => {
    // Short inner table on a long page must not swallow the gesture.
    assert.equal(canScrollFurther(0, 800, 800, "down"), false);
    assert.equal(canScrollFurther(0, 800, 800, "up"), false);
  });
});

describe("voiceScrollDurationMs", () => {
  it("scales with distance at a readable pace", () => {
    assert.equal(voiceScrollDurationMs(0), 0);
    // One viewport-ish step should read as a slow drag, not a snap.
    assert.ok(voiceScrollDurationMs(600) >= 1000);
    assert.ok(voiceScrollDurationMs(600) <= 2000);
    // Short hops still get a visible minimum.
    assert.equal(voiceScrollDurationMs(50), 550);
    // Long jumps to top/bottom stay bounded.
    assert.equal(voiceScrollDurationMs(50_000), 4000);
    assert.equal(voiceScrollDurationMs(-600), voiceScrollDurationMs(600));
  });
});

describe("isMajorScrollport", () => {
  it("only lets page-sized scrollports beat the document", () => {
    assert.equal(isMajorScrollport(160, 900), false);
    assert.equal(isMajorScrollport(700, 900), true);
    // Small viewport still needs a usable scrollport height.
    assert.equal(isMajorScrollport(200, 400), false);
    assert.equal(isMajorScrollport(320, 400), true);
  });
});

describe("elementCanScrollY", () => {
  it("requires overflow scrollport and taller content", () => {
    // Non-overflow main (typical AppShell) must not be treated as scrollable.
    assert.equal(elementCanScrollY(4000, 800, "visible"), false);
    assert.equal(elementCanScrollY(4000, 800, "auto"), true);
    assert.equal(elementCanScrollY(800, 800, "auto"), false);
    assert.equal(elementCanScrollY(1200, 800, "scroll"), true);
  });
});
