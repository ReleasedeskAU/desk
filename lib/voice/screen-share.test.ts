/**
 * Screen-share intent + constants tests.
 * Run: npx tsx --test lib/voice/screen-share.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VOICE_AV_PROACTIVE_RECONNECT_MS,
  VOICE_AV_SESSION_LIMIT_MS,
  VOICE_SCREEN_CAPTURE_MAX_WIDTH,
  VOICE_SCREEN_IDLE_FRAME_MS,
  VOICE_SCREEN_JPEG_QUALITY,
  VOICE_SCREEN_MEDIA_RESOLUTION,
  VOICE_SCREEN_MIN_FRAME_GAP_MS,
  isScreenRelatedQuery,
  utteranceHasWriteIntent,
} from "./screen-share";

describe("isScreenRelatedQuery", () => {
  it("matches common screen / page questions", () => {
    assert.equal(isScreenRelatedQuery("what am I looking at"), true);
    assert.equal(isScreenRelatedQuery("What's on this page?"), true);
    assert.equal(isScreenRelatedQuery("summarize this screen"), true);
    assert.equal(isScreenRelatedQuery("what's wrong with this page"), true);
    assert.equal(isScreenRelatedQuery("describe the table on this page"), true);
    assert.equal(isScreenRelatedQuery("can you see my screen"), true);
    assert.equal(isScreenRelatedQuery("are you able to see the screen"), true);
  });

  it("does not match ordinary navigation / summary requests", () => {
    assert.equal(isScreenRelatedQuery("open the first release"), false);
    assert.equal(isScreenRelatedQuery("summarize REL-0001"), false);
    assert.equal(isScreenRelatedQuery("go to calendar"), false);
  });
});

describe("utteranceHasWriteIntent", () => {
  it("requires explicit spoken write words", () => {
    assert.equal(utteranceHasWriteIntent("approve REL-0001"), true);
    assert.equal(utteranceHasWriteIntent("yes"), true);
    assert.equal(utteranceHasWriteIntent("acknowledge that alert"), true);
    assert.equal(utteranceHasWriteIntent("what am I looking at"), false);
    assert.equal(utteranceHasWriteIntent("summarize this page"), false);
  });
});

describe("screen-share constants", () => {
  it("uses HIGH media resolution and enforces ≤1 fps gap", () => {
    // Must stay aligned with MediaResolution.MEDIA_RESOLUTION_HIGH in ephemeral-token.ts.
    assert.equal(VOICE_SCREEN_MEDIA_RESOLUTION, "MEDIA_RESOLUTION_HIGH");
    assert.equal(VOICE_SCREEN_MIN_FRAME_GAP_MS, 1000);
  });

  it("captures wide enough frames for table OCR", () => {
    assert.ok(VOICE_SCREEN_CAPTURE_MAX_WIDTH >= 1280);
    assert.ok(VOICE_SCREEN_JPEG_QUALITY >= 0.9);
  });

  it("schedules A+V proactive reconnect before the 2-minute hard limit", () => {
    assert.equal(VOICE_AV_SESSION_LIMIT_MS, 120_000);
    assert.ok(VOICE_AV_PROACTIVE_RECONNECT_MS < VOICE_AV_SESSION_LIMIT_MS);
    assert.ok(VOICE_AV_PROACTIVE_RECONNECT_MS >= 90_000);
  });

  it("keeps idle refresh at or below 1 fps", () => {
    assert.ok(VOICE_SCREEN_IDLE_FRAME_MS >= VOICE_SCREEN_MIN_FRAME_GAP_MS);
  });
});
