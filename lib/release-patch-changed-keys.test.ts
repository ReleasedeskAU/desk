/**
 * Run: npx tsx --test lib/release-patch-changed-keys.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keysWithActualReleasePatchChanges } from "@/lib/release-patch-changed-keys";

describe("keysWithActualReleasePatchChanges", () => {
  const existing = {
    id: "rel_1",
    releaseCode: "REL-0001",
    name: "Kyriba UI Tweak",
    status: "Pending CAB",
    priority: "P4 - Low",
    notes: "Resource conflict",
    releaseDate: new Date("2026-07-20T00:00:00.000Z"),
  };

  it("ignores echoed Release ID and other unchanged scalars on a status-only save", () => {
    const keys = keysWithActualReleasePatchChanges({
      existing,
      body: {
        id: "rel_1",
        releaseCode: "REL-0001",
        name: "Kyriba UI Tweak",
        status: "Rolled Back",
        priority: "P4 - Low",
        notes: "Resource conflict",
        releaseDate: "2026-07-20",
      },
    });
    assert.deepEqual(keys, ["status"]);
  });

  it("keeps releaseCode when the caller actually changes it", () => {
    const keys = keysWithActualReleasePatchChanges({
      existing,
      body: { releaseCode: "REL-9999", status: "Pending CAB" },
    });
    assert.ok(keys.includes("releaseCode"));
  });

  it("treats application id lists as unchanged when membership matches", () => {
    const keys = keysWithActualReleasePatchChanges({
      existing,
      body: {
        status: "Pending CAB",
        applicationIds: ["b", "a"],
      },
      currentApplicationIds: ["a", "b"],
    });
    assert.deepEqual(keys, ["status"]);
  });

  it("flags application list edits", () => {
    const keys = keysWithActualReleasePatchChanges({
      existing,
      body: { applicationIds: ["a"] },
      currentApplicationIds: ["a", "b"],
    });
    assert.deepEqual(keys, ["applicationIds"]);
  });

  it("ignores owner label rewrite when releaseOwnerId is unchanged", () => {
    const keys = keysWithActualReleasePatchChanges({
      existing: {
        ...existing,
        status: "Blocked",
        releaseOwnerId: "user_1",
        owner: "USR-061 — Robert Shield",
      },
      body: {
        status: "UAT",
        releaseOwnerId: "user_1",
        owner: "Robert Shield",
      },
    });
    assert.deepEqual(keys, ["status"]);
  });

  it("ignores programProject empty → N/A normalization on a status-only save", () => {
    const keys = keysWithActualReleasePatchChanges({
      existing: {
        ...existing,
        status: "CAB Approved",
        programProject: null,
      },
      body: {
        status: "Ready to deploy",
        programProject: "N/A",
      },
    });
    assert.deepEqual(keys, ["status"]);
  });
});
