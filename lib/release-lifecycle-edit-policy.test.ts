import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionUser } from "@/lib/auth/roles";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  canOfferReleaseEditAction,
  deniedReleaseEditFields,
  isReleaseFieldEditable,
  isReleaseFullyLocked,
  resolveReleaseEditMode,
  shouldOfferReleaseEdit,
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

  it("allows comms, approval, rollback, and stakeholders under limited edit", () => {
    for (const field of [
      "commsPlan",
      "hypercarePlan",
      "trainingStatus",
      "approvalStatus",
      "rollbackPlan",
      "stakeholderIds",
    ]) {
      assert.equal(isReleaseFieldEditable("limited", field), true, field);
    }
    const { denied } = deniedReleaseEditFields(config, "CAB Approved", [
      "commsPlan",
      "stakeholderIds",
      "name",
    ]);
    assert.deepEqual(denied, ["name"]);
  });

  it("allows Business and Ops sign-off under limited edit", () => {
    assert.equal(isReleaseFieldEditable("limited", "businessSignoff"), true);
    assert.equal(isReleaseFieldEditable("limited", "opsSignoff"), true);
    const { denied } = deniedReleaseEditFields(config, "Pending CAB", [
      "businessSignoff",
      "opsSignoff",
      "name",
    ]);
    assert.deepEqual(denied, ["name"]);
  });
});

const editor: SessionUser = {
  id: "user-editor",
  email: "editor@example.com",
  name: "Editor",
  role: "editor",
};

const readonly: SessionUser = {
  id: "user-readonly",
  email: "readonly@example.com",
  name: "Readonly",
  role: "readonly",
};

describe("canOfferReleaseEditAction", () => {
  it("offers Edit for configured editable statuses including limited and read_only", () => {
    assert.equal(canOfferReleaseEditAction(config, "Draft"), true);
    assert.equal(canOfferReleaseEditAction(config, "Pending CAB"), true);
    assert.equal(canOfferReleaseEditAction(config, "Deploying"), true);
    assert.equal(canOfferReleaseEditAction(config, "Closed"), true);
  });

  it("hides Edit for a fully locked (Cancelled) release", () => {
    assert.equal(canOfferReleaseEditAction(config, "Cancelled"), false);
  });

  it("hides Edit when the status is missing from config (no guess)", () => {
    assert.equal(canOfferReleaseEditAction(config, "Not A Real Status"), false);
  });

  it("hides Edit when editMode is missing on the resolved status", () => {
    const stripped = {
      ...config,
      statuses: config.statuses.map((status) =>
        status.key === "draft"
          ? { ...status, editMode: undefined as unknown as typeof status.editMode }
          : status
      ),
    };
    assert.equal(canOfferReleaseEditAction(stripped, "Draft"), false);
  });
});

describe("shouldOfferReleaseEdit", () => {
  it("offers Edit for an editor on an editable status", () => {
    assert.equal(shouldOfferReleaseEdit({ user: editor, config, status: "Draft" }), true);
  });

  it("denies Edit for readonly even when the status is editable", () => {
    assert.equal(
      shouldOfferReleaseEdit({ user: readonly, config, status: "Draft" }),
      false
    );
  });
});
