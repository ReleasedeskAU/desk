/**
 * Run: npx tsx --test lib/blocker-patch-changed-keys.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keysWithActualBlockerPatchChanges } from "@/lib/blocker-patch-changed-keys";

describe("keysWithActualBlockerPatchChanges", () => {
  const existing = {
    id: "blk_1",
    blockerCode: "BLK-0001",
    status: "Closed",
    blockerDescription: "Env conflict",
    departmentName: "Finance",
    applicationName: "Kyriba",
    assignedTo: "Ada",
    raisedDate: new Date("2026-06-20T00:00:00.000Z"),
  };

  it("ignores echoed fields on a Closed status-only save so identity does not mask the transition", () => {
    const keys = keysWithActualBlockerPatchChanges({
      existing,
      body: {
        status: "Open",
        blockerDescription: "Env conflict",
        department: "Finance",
        application: "Kyriba",
        assignedTo: "Ada",
        raisedDate: "2026-06-20",
      },
    });
    assert.deepEqual(keys, ["status"]);
  });

  it("flags a real description edit", () => {
    const keys = keysWithActualBlockerPatchChanges({
      existing,
      body: { blockerDescription: "Changed" },
    });
    assert.deepEqual(keys, ["blockerDescription"]);
  });
});
