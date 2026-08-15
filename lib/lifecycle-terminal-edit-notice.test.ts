import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  lifecycleTerminalEditNoticeText,
  shouldShowTerminalLifecycleEditNotice,
} from "./lifecycle-terminal-edit-notice";

describe("shouldShowTerminalLifecycleEditNotice", () => {
  it("shows when the lifecycle marks the status terminal", () => {
    assert.equal(
      shouldShowTerminalLifecycleEditNotice({
        currentLabel: "Closed",
        legalNextCount: 0,
        isTerminal: true,
      }),
      true
    );
  });

  it("shows on empty legal-next even when terminal flag is false", () => {
    assert.equal(
      shouldShowTerminalLifecycleEditNotice({
        currentLabel: "Open",
        legalNextCount: 0,
        isTerminal: false,
      }),
      true
    );
  });

  it("falls back to empty legal-next when terminal flag is unknown", () => {
    assert.equal(
      shouldShowTerminalLifecycleEditNotice({
        currentLabel: "Approved",
        legalNextCount: 0,
      }),
      true
    );
    assert.equal(
      shouldShowTerminalLifecycleEditNotice({
        currentLabel: "Pending",
        legalNextCount: 2,
      }),
      false
    );
  });

  it("ignores blank labels", () => {
    assert.equal(
      shouldShowTerminalLifecycleEditNotice({
        currentLabel: "  ",
        legalNextCount: 0,
        isTerminal: true,
      }),
      false
    );
  });
});

describe("lifecycleTerminalEditNoticeText", () => {
  it("names the final status and blocks forward/back wording", () => {
    const text = lifecycleTerminalEditNoticeText("Cancelled", "status");
    assert.match(text, /Cancelled/);
    assert.match(text, /final status/i);
    assert.match(text, /forward or back/i);
  });

  it("uses decision wording for approvals", () => {
    const text = lifecycleTerminalEditNoticeText("Approved with Conditions", "decision");
    assert.match(text, /Approved with Conditions/);
    assert.match(text, /final decision/i);
  });
});

describe("Edit Risk wires the final-status notice", () => {
  it("shows the shared notice on the Risk Edit status field", () => {
    const src = readFileSync(
      join(__dirname, "..", "app", "(main)", "risks", "[id]", "page.tsx"),
      "utf8"
    );
    assert.match(src, /shouldShowTerminalLifecycleEditNotice/);
    assert.match(src, /LifecycleTerminalStatusNotice/);
  });
});
