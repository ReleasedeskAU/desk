import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  deniedReleaseEditFields,
  isReleaseFieldEditable,
  isReleaseFullyLocked,
  resolveReleaseEditMode,
} from "@/lib/release-lifecycle-edit-policy";

const config = createDefaultReleaseLifecycleConfig();

describe("resolveReleaseEditMode", () => {
  it("marks Closed/Cancelled immutable, Deploying view-only, Deployed limited", () => {
    assert.equal(resolveReleaseEditMode(config, "Closed"), "immutable");
    assert.equal(resolveReleaseEditMode(config, "Cancelled"), "immutable");
    assert.equal(resolveReleaseEditMode(config, "Deploying"), "read_only");
    assert.equal(resolveReleaseEditMode(config, "Deployed"), "limited");
    assert.equal(resolveReleaseEditMode(config, "Pending CAB"), "limited");
    assert.equal(resolveReleaseEditMode(config, "Rejected"), "full");
    assert.equal(resolveReleaseEditMode(config, "Draft"), "full");
  });
});

describe("deniedReleaseEditFields", () => {
  it("blocks scope edits on limited statuses but allows notes", () => {
    const { denied } = deniedReleaseEditFields(config, "CAB Approved", [
      "name",
      "notes",
      "status",
    ]);
    assert.deepEqual(denied, ["name"]);
    assert.equal(isReleaseFieldEditable("limited", "notes"), true);
  });

  it("allows notes on Deployed (limited) but still blocks scope fields", () => {
    const { denied } = deniedReleaseEditFields(config, "Deployed", [
      "name",
      "notes",
      "status",
    ]);
    assert.deepEqual(denied, ["name"]);
    assert.equal(isReleaseFieldEditable("limited", "notes"), true);
  });

  it("blocks all edits including status when Cancelled", () => {
    const { denied, mode } = deniedReleaseEditFields(config, "Cancelled", [
      "notes",
      "name",
      "status",
      "decision",
    ]);
    assert.equal(mode, "immutable");
    assert.deepEqual(denied.sort(), ["decision", "name", "notes", "status"]);
  });

  it("still allows status (only) on Closed, which is immutable but not Cancelled", () => {
    const { denied } = deniedReleaseEditFields(config, "Closed", ["notes", "name", "status"]);
    assert.ok(denied.includes("notes"));
    assert.ok(denied.includes("name"));
    assert.equal(denied.includes("status"), false);
    assert.equal(isReleaseFullyLocked(config, "Closed"), false);
    assert.equal(isReleaseFullyLocked(config, "Cancelled"), true);
    assert.equal(isReleaseFullyLocked(config, "canceled"), true);
    assert.equal(isReleaseFullyLocked(config, "Planning"), false);
  });
});
