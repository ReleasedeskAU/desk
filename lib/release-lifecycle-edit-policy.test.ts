import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  deniedReleaseEditFields,
  isReleaseFieldEditable,
  resolveReleaseEditMode,
} from "@/lib/release-lifecycle-edit-policy";

const config = createDefaultReleaseLifecycleConfig();

describe("resolveReleaseEditMode", () => {
  it("marks Closed/Cancelled immutable and Deploying/Deployed read_only", () => {
    assert.equal(resolveReleaseEditMode(config, "Closed"), "immutable");
    assert.equal(resolveReleaseEditMode(config, "Cancelled"), "immutable");
    assert.equal(resolveReleaseEditMode(config, "Deploying"), "read_only");
    assert.equal(resolveReleaseEditMode(config, "Deployed"), "read_only");
    assert.equal(resolveReleaseEditMode(config, "Pending CAB"), "limited");
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

  it("blocks all non-status edits when immutable", () => {
    const { denied } = deniedReleaseEditFields(config, "Closed", [
      "notes",
      "name",
      "status",
    ]);
    assert.ok(denied.includes("notes"));
    assert.ok(denied.includes("name"));
    assert.equal(denied.includes("status"), false);
  });
});
