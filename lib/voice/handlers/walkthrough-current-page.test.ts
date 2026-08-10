/**
 * current_page walkthrough — explain + live count + scroll.
 * Run: npx tsx --test lib/voice/handlers/walkthrough-current-page.test.ts
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { setVoiceAppContext } from "@/lib/voice/app-context";
import { handleRunWalkthrough } from "./walkthrough";
import { formatPageExplainSpeech, resolveVoicePageExplain } from "@/lib/voice/page-explain-catalog";

describe("run_walkthrough current_page", () => {
  beforeEach(() => setVoiceAppContext(null));
  afterEach(() => setVoiceAppContext(null));

  it("builds a Settings tour script with tabs and live team count", async () => {
    setVoiceAppContext({
      page: "/settings",
      entityType: "user",
      note: "team-members",
      totalCount: 4,
      visible: [
        { code: "u1", label: "Priya Sharma — Release Manager", path: "/settings?tab=team" },
        { code: "u2", label: "Raj Patel — DB Lead", path: "/settings?tab=team" },
      ],
    });

    const result = await handleRunWalkthrough(
      { tour: "current_page" },
      {
        push: () => {},
        getCurrentHref: () => "/settings",
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.tourId, "current_page");
    assert.ok(result.script && result.script.length >= 3);
    const joined = result.script!.join(" ");
    assert.match(joined, /4 row/i);
    assert.match(joined, /Team Members/i);
    assert.match(joined, /Risk Engine/i);
  });

  it("settings explain_page lists tabs from SETTINGS_TABS", () => {
    const page = resolveVoicePageExplain("settings");
    assert.ok(page);
    assert.ok(page!.sections && page!.sections.length >= 8);
    const speech = formatPageExplainSpeech(page!);
    assert.match(speech, /Team Members/);
    assert.match(speech, /Risk Engine/);
    assert.match(speech, /current_page/);
  });
});
