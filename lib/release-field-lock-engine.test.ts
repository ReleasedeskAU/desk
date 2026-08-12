/**
 * Release field-lock engine tests.
 * Run: npx tsx --test lib/release-field-lock-engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDefaultReleaseLifecycleConfig } from "./release-lifecycle-config";
import { defaultFieldLockRowsFromCatalog } from "./release-field-lock-config-db";
import {
  getFieldLockStateFromRows,
  validateReleaseFieldUpdateWithRows,
} from "./release-field-lock-engine";
import { RELEASE_FIELD_LOCK_CATALOG } from "./release-field-lock-catalog";

describe("release field-lock engine", () => {
  const lifecycle = createDefaultReleaseLifecycleConfig();
  const rows = defaultFieldLockRowsFromCatalog(lifecycle);

  it("rejects locked fields (releaseCode always locked)", () => {
    const result = validateReleaseFieldUpdateWithRows(rows, "draft", [
      "releaseCode",
    ]);
    assert.equal(result.allowed, false);
    assert.ok(result.rejected.some((r) => r.field === "releaseCode"));
  });

  it("allows editable fields in Draft", () => {
    const result = validateReleaseFieldUpdateWithRows(rows, "draft", [
      "name",
      "priority",
      "releaseSize",
    ]);
    assert.equal(result.allowed, true);
    assert.equal(result.rejected.length, 0);
  });

  it("VR-21: Size/Priority at CAB Approved yield side-effect revert", () => {
    const result = validateReleaseFieldUpdateWithRows(rows, "cab_approved", [
      "releaseSize",
      "priority",
    ]);
    assert.equal(result.allowed, true);
    assert.equal(result.sideEffects.length, 2);
    assert.ok(
      result.sideEffects.every((s) => s.effect === "revert_to_pending_cab")
    );
  });

  it("defaults to locked when status key is missing from rules", () => {
    const state = getFieldLockStateFromRows(rows, "name", "status_does_not_exist");
    assert.equal(state, "locked");
    const result = validateReleaseFieldUpdateWithRows(
      rows,
      "status_does_not_exist",
      ["name"]
    );
    assert.equal(result.allowed, false);
  });

  it("catalog marks computed/audit/status as non-configurable", () => {
    for (const key of [
      "releaseCode",
      "releaseHealth",
      "readinessPercent",
      "weightedRiskScore",
      "createdAt",
      "updatedAt",
      "status",
    ]) {
      const entry = RELEASE_FIELD_LOCK_CATALOG.find((e) => e.fieldKey === key);
      assert.ok(entry, key);
      assert.equal(entry!.isConfigurable, false);
    }
  });

  it("does not enforce status via field locks (info-only)", () => {
    const result = validateReleaseFieldUpdateWithRows(rows, "closed", [
      "status",
    ]);
    assert.equal(result.allowed, true);
    assert.equal(result.rejected.length, 0);
  });
});
