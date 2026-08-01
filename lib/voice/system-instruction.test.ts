/**
 * Shared Live systemInstruction builder.
 * Run: npx tsx --test lib/voice/system-instruction.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { VOICE_TOOL_MANIFEST } from "./tool-manifest";
import { VOICE_WRITE_ACTION_TYPES } from "./action-types";
import {
  buildVoiceSystemInstruction,
  voiceSystemInstructionParts,
  voiceToolNamesList,
} from "./system-instruction";

describe("buildVoiceSystemInstruction", () => {
  it("lists every manifest tool name in both constraints and full", () => {
    const constraints = buildVoiceSystemInstruction({ detail: "constraints" });
    const full = buildVoiceSystemInstruction({ detail: "full" });
    for (const tool of VOICE_TOOL_MANIFEST) {
      assert.match(constraints, new RegExp(`\\b${tool.name}\\b`));
      assert.match(full, new RegExp(`\\b${tool.name}\\b`));
    }
    assert.equal(voiceToolNamesList().split(", ").length, VOICE_TOOL_MANIFEST.length);
  });

  it("lists every write action type in both variants", () => {
    const constraints = buildVoiceSystemInstruction({ detail: "constraints" });
    const full = buildVoiceSystemInstruction({ detail: "full" });
    for (const write of VOICE_WRITE_ACTION_TYPES) {
      assert.match(constraints, new RegExp(`\\b${write}\\b`));
      assert.match(full, new RegExp(`\\b${write}\\b`));
    }
  });

  it("makes constraints a composed subset of the same parts list as full", () => {
    const parts = voiceSystemInstructionParts(false);
    const constraintIds = parts.filter((p) => p.inConstraints).map((p) => p.id);
    const allIds = parts.map((p) => p.id);
    for (const id of constraintIds) {
      assert.ok(allIds.includes(id), `constraints part ${id} missing from full parts`);
    }
    assert.ok(constraintIds.length < allIds.length);
    assert.ok(constraintIds.includes("tools"));
    assert.ok(constraintIds.includes("writes"));
    assert.ok(!constraintIds.includes("catalog_sidebar"));
  });

  it("includes screen-share and catalog guidance only in full", () => {
    const constraints = buildVoiceSystemInstruction({ detail: "constraints" });
    const fullOff = buildVoiceSystemInstruction({
      detail: "full",
      screenShareActive: false,
    });
    const fullOn = buildVoiceSystemInstruction({
      detail: "full",
      screenShareActive: true,
    });
    assert.ok(!/\[SCREEN\] JPEG/.test(constraints));
    assert.match(fullOff, /Screen share is off/);
    assert.match(fullOn, /\[SCREEN\] JPEG/);
    assert.match(fullOff, /get_page_context/);
    assert.match(fullOff, /explain_page/);
    assert.match(fullOff, /apply_list_filters/);
    assert.match(constraints, /Follow \[SESSION\]/);
    assert.match(constraints, /confirm_action accept=false/);
  });
});
