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

  it("includes release-manager tools and no extras", () => {
    const names = VOICE_TOOL_MANIFEST.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "apply_list_filters",
      "confirm_action",
      "explain_page",
      "get_summary",
      "navigate_to",
      "propose_action",
      "run_walkthrough",
      "search_entity",
    ]);
  });

  it("maps to Live functionDeclarations", () => {
    const decls = voiceToolDeclarationsForLive();
    assert.equal(decls.length, 8);
    const propose = decls.find((d) => d.name === "propose_action");
    const confirm = decls.find((d) => d.name === "confirm_action");
    const filters = decls.find((d) => d.name === "apply_list_filters");
    const explain = decls.find((d) => d.name === "explain_page");
    const walk = decls.find((d) => d.name === "run_walkthrough");
    assert.ok(propose);
    assert.ok(confirm);
    assert.ok(filters);
    assert.ok(explain);
    assert.ok(walk);
    assert.deepEqual(propose!.parameters.required, ["actionType", "params"]);
    assert.deepEqual(confirm!.parameters.required, ["actionId"]);
    assert.deepEqual(walk!.parameters.required, ["tour"]);
  });
});
