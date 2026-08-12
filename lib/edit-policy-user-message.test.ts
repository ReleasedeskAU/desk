/**
 * Unit tests for edit-policy user-facing messages.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { editPolicyDeniedMessage } from "@/lib/edit-policy-user-message";

describe("editPolicyDeniedMessage", () => {
  it("explains immutable without raw mode tokens", () => {
    const msg = editPolicyDeniedMessage({
      entity: "release",
      mode: "immutable",
      statusLabel: "Closed",
      deniedFields: ["notes", "owner"],
    });
    assert.match(msg, /can’t be edited in “Closed”/i);
    assert.match(msg, /locked after that decision/i);
    assert.match(msg, /notes, owner/);
    assert.doesNotMatch(msg, /immutable/);
  });

  it("uses decision wording for approvals", () => {
    const msg = editPolicyDeniedMessage({
      entity: "approval",
      mode: "immutable",
      statusLabel: "Approved",
      statusWord: "decision",
      deniedFields: ["comments"],
    });
    assert.match(msg, /approval/);
    assert.match(msg, /Approved/);
  });
});
