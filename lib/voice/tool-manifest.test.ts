/**
 * Voice toolManifest — release-manager tools.
 * Run: npx tsx --test lib/voice/tool-manifest.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VOICE_LIVE_MODEL,
  VOICE_TOOL_MANIFEST,
  voiceToolDeclarationsForLive,
} from "./tool-manifest";

const EXPECTED = [
  "apply_list_filters",
  "compare_releases",
  "configure_table_view",
  "confirm_action",
  "copy_visible_codes",
  "explain_page",
  "get_attention_brief",
  "get_calendar_window",
  "get_page_context",
  "get_release_bundle",
  "get_summary",
  "lookup_navigation",
  "navigate_to",
  "open_entity",
  "propose_action",
  "run_walkthrough",
  "scroll_page",
  "search_entity",
  "undo_filters",
].sort();

describe("VOICE_TOOL_MANIFEST", () => {
  it("targets gemini-3.1-flash-live-preview", () => {
    assert.equal(VOICE_LIVE_MODEL, "gemini-3.1-flash-live-preview");
  });

  it("includes manager tools and no extras", () => {
    const names = VOICE_TOOL_MANIFEST.map((t) => t.name).sort();
    assert.deepEqual(names, EXPECTED);
  });

  it("maps to Live functionDeclarations", () => {
    const decls = voiceToolDeclarationsForLive();
    assert.equal(decls.length, EXPECTED.length);
    assert.ok(decls.find((d) => d.name === "get_release_bundle"));
    assert.ok(decls.find((d) => d.name === "get_attention_brief"));
    assert.ok(decls.find((d) => d.name === "open_entity"));
    assert.ok(decls.find((d) => d.name === "undo_filters"));
    const propose = decls.find((d) => d.name === "propose_action");
    assert.ok(propose);
    assert.match(propose!.parameters.properties.actionType.description, /update_blocker/);
  });
});
