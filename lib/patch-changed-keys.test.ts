import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keysWithActualPatchChanges } from "@/lib/patch-changed-keys";

describe("keysWithActualPatchChanges", () => {
  it("keeps status even when unchanged so transitions still run", () => {
    const keys = keysWithActualPatchChanges({
      existing: { status: "Open", notes: "a" },
      body: { status: "Open", notes: "a" },
    });
    assert.deepEqual(keys, ["status"]);
  });

  it("ignores echoed fields that match the stored row", () => {
    const keys = keysWithActualPatchChanges({
      existing: { status: "Open", priority: "P2", notes: null },
      body: { status: "Resolved", priority: "P2", notes: "" },
    });
    assert.deepEqual(keys, ["status"]);
  });

  it("maps request aliases to stored columns", () => {
    const keys = keysWithActualPatchChanges({
      existing: {
        status: "Detected",
        applicationName: "Kyriba",
        departmentName: "Finance",
      },
      body: {
        status: "Detected",
        application: "Kyriba",
        department: "Finance",
        notes: "new",
      },
      bodyToStored: {
        application: "applicationName",
        department: "departmentName",
      },
    });
    assert.deepEqual(keys, ["status", "notes"]);
  });

  it("skips request-only keys with no stored column", () => {
    const keys = keysWithActualPatchChanges({
      existing: { status: "Identified", applicationName: "Kyriba" },
      body: {
        status: "Identified",
        applicationId: "app_1",
        applicationName: "Kyriba",
      },
      ignoreKeys: new Set(["applicationId"]),
    });
    assert.deepEqual(keys, ["status"]);
  });

  it("compares date keys by calendar day", () => {
    const keys = keysWithActualPatchChanges({
      existing: {
        status: "Open",
        detectedDate: new Date("2026-06-01T12:00:00.000Z"),
      },
      body: {
        status: "Open",
        detectedDate: "2026-06-01",
        etaToFix: "2026-06-10",
      },
      dateKeys: new Set(["detectedDate", "etaToFix"]),
    });
    assert.deepEqual(keys, ["status", "etaToFix"]);
  });
});
