/**
 * Run: npx tsx --test lib/approval-patch-changed-keys.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keysWithActualApprovalPatchChanges } from "@/lib/approval-patch-changed-keys";

describe("keysWithActualApprovalPatchChanges", () => {
  const existing = {
    id: "apr_1",
    approvalCode: "APR-0001",
    decision: "Approved",
    approvalType: "CAB Final",
    comments: "Signed",
    conditions: null,
    submittedDate: new Date("2026-06-20T00:00:00.000Z"),
    decisionDate: new Date("2026-06-21T00:00:00.000Z"),
  };

  it("ignores echoed fields on a terminal decision save so identity does not mask the transition", () => {
    const keys = keysWithActualApprovalPatchChanges({
      existing,
      body: {
        decision: "Pending",
        approvalType: "CAB Final",
        comments: "Signed",
        submittedDate: "2026-06-20",
        decisionDate: "2026-06-21",
      },
    });
    assert.deepEqual(keys, ["decision"]);
  });

  it("flags a real comments edit", () => {
    const keys = keysWithActualApprovalPatchChanges({
      existing,
      body: { comments: "Changed" },
    });
    assert.deepEqual(keys, ["comments"]);
  });
});
