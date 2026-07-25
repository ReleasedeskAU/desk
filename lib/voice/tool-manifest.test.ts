/**
 * Phase-3 toolManifest — 5 tools including propose/confirm.
 * Run: npx tsx --test lib/voice/tool-manifest.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VOICE_LIVE_MODEL,
  VOICE_TOOL_MANIFEST,
  voiceToolDeclarationsForLive,
} from "./tool-manifest";

describe("VOICE_TOOL_MANIFEST", () => {
  it("targets gemini-3.1-flash-live-preview", () => {
    assert.equal(VOICE_LIVE_MODEL, "gemini-3.1-flash-live-preview");
  });

  it("includes Phase-3 write tools and no extras", () => {
    const names = VOICE_TOOL_MANIFEST.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "confirm_action",
      "get_summary",
      "navigate_to",
      "propose_action",
      "search_entity",
    ]);
  });

  it("maps to Live functionDeclarations", () => {
    const decls = voiceToolDeclarationsForLive();
    assert.equal(decls.length, 5);
    const propose = decls.find((d) => d.name === "propose_action");
    const confirm = decls.find((d) => d.name === "confirm_action");
    assert.ok(propose);
    assert.ok(confirm);
    assert.deepEqual(propose!.parameters.required, ["actionType", "params"]);
    assert.deepEqual(confirm!.parameters.required, ["actionId"]);
  });
});
