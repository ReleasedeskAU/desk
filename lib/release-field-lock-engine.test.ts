/**
 * Release field-lock engine tests.
 * Run: npx tsx --test lib/release-field-lock-engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDefaultReleaseLifecycleConfig } from "./release-lifecycle-config";
import {
  defaultFieldLockRowsFromCatalog,
  reconcileRejectedReworkUnlock,
} from "./release-field-lock-config-db";
import {
  getFieldLockStateFromRows,
  validateReleaseFieldUpdateWithRows,
} from "./release-field-lock-engine";
import {
  catalogEntryForBodyKey,
  RELEASE_FIELD_LOCK_CATALOG,
} from "./release-field-lock-catalog";

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

  it("covers newly editable Edit Release fields (comms, approval, stakeholders)", () => {
    assert.equal(catalogEntryForBodyKey("hypercarePlan")?.fieldKey, "hypercarePlan");
    assert.equal(catalogEntryForBodyKey("commsPlan")?.fieldKey, "commsPlan");
    assert.equal(catalogEntryForBodyKey("trainingStatus")?.fieldKey, "trainingStatus");
    assert.equal(catalogEntryForBodyKey("approvalStatus")?.fieldKey, "approvalStatus");
    assert.equal(catalogEntryForBodyKey("rollbackPlan")?.fieldKey, "rollbackPlan");
    assert.equal(catalogEntryForBodyKey("stakeholderIds")?.fieldKey, "stakeholders");
    assert.equal(
      getFieldLockStateFromRows(rows, "hypercarePlan", "deploying"),
      "locked"
    );
    assert.equal(
      getFieldLockStateFromRows(rows, "commsPlan", "planning"),
      "editable"
    );
    assert.equal(
      getFieldLockStateFromRows(rows, "stakeholders", "pending_cab"),
      "locked"
    );
    const denied = validateReleaseFieldUpdateWithRows(rows, "deploying", [
      "hypercarePlan",
      "commsPlan",
      "trainingStatus",
    ]);
    assert.equal(denied.allowed, false);
    assert.ok(denied.rejected.some((r) => r.field === "hypercarePlan"));
  });

  it("does not enforce status via field locks (info-only)", () => {
    const result = validateReleaseFieldUpdateWithRows(rows, "closed", [
      "status",
    ]);
    assert.equal(result.allowed, true);
    assert.equal(result.rejected.length, 0);
  });

  it("unlocks rework fields at Rejected (sheet: gates unlocked)", () => {
    const name = getFieldLockStateFromRows(rows, "name", "rejected");
    const size = getFieldLockStateFromRows(rows, "releaseSize", "rejected");
    const code = getFieldLockStateFromRows(rows, "releaseCode", "rejected");
    assert.equal(name, "editable");
    assert.equal(size, "editable");
    assert.equal(code, "locked");
    const result = validateReleaseFieldUpdateWithRows(rows, "rejected", [
      "name",
      "releaseSize",
    ]);
    assert.equal(result.allowed, true);
  });

  it("names the status in lock-denial copy", () => {
    const result = validateReleaseFieldUpdateWithRows(rows, "deployed", [
      "name",
    ]);
    assert.equal(result.allowed, false);
    assert.match(result.rejected[0]?.reason ?? "", /Deployed/);
  });

  it("upgrades stored Rejected locked cells to editable", () => {
    const lockedName = rows.map((row) =>
      row.fieldKey === "name"
        ? { ...row, statusRules: { ...row.statusRules, rejected: "locked" as const } }
        : row
    );
    const next = reconcileRejectedReworkUnlock(lockedName);
    assert.ok(next.changedFieldKeys.includes("name"));
    assert.equal(
      next.rows.find((r) => r.fieldKey === "name")?.statusRules.rejected,
      "editable"
    );
  });

  it("still rejects a real Release ID change even when status is also sent", () => {
    const result = validateReleaseFieldUpdateWithRows(rows, "pending_cab", [
      "status",
      "releaseCode",
    ]);
    assert.equal(result.allowed, false);
    assert.ok(result.rejected.some((r) => r.field === "releaseCode"));
  });
});
