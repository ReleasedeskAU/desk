import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionUser } from "@/lib/auth/roles";
import { createDefaultSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import {
  canOfferSignoffEditAction,
  shouldOfferSignoffEdit,
} from "@/lib/signoff-lifecycle-edit-policy";

const config = createDefaultSignoffLifecycleConfig();

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

describe("canOfferSignoffEditAction", () => {
  it("offers Edit for Pending (editable, non-terminal)", () => {
    assert.equal(canOfferSignoffEditAction(config, "Pending"), true);
    assert.equal(canOfferSignoffEditAction(config, "pending"), true);
    assert.equal(canOfferSignoffEditAction(config, ""), true);
  });

  it("hides Edit for immutable terminal decisions", () => {
    assert.equal(canOfferSignoffEditAction(config, "Approved"), false);
    assert.equal(canOfferSignoffEditAction(config, "Rejected"), false);
    assert.equal(canOfferSignoffEditAction(config, "Approved with Conditions"), false);
    assert.equal(canOfferSignoffEditAction(config, "Withdrawn"), false);
    assert.equal(canOfferSignoffEditAction(config, "Expired"), false);
  });

  it("hides Edit when the status is missing from config (no guess)", () => {
    assert.equal(canOfferSignoffEditAction(config, "Not A Real Status"), false);
  });

  it("hides Edit when editMode is missing on the resolved status", () => {
    const stripped = {
      ...config,
      statuses: config.statuses.map((status) =>
        status.key === "pending"
          ? { ...status, editMode: undefined as unknown as typeof status.editMode }
          : status
      ),
    };
    assert.equal(canOfferSignoffEditAction(stripped, "Pending"), false);
  });
});

describe("shouldOfferSignoffEdit", () => {
  it("offers Edit for an editor on an editable status", () => {
    assert.equal(
      shouldOfferSignoffEdit({ user: editor, config, status: "Pending" }),
      true
    );
  });

  it("denies Edit for readonly even when the status is editable", () => {
    assert.equal(
      shouldOfferSignoffEdit({ user: readonly, config, status: "Pending" }),
      false
    );
  });

  it("denies Edit when config is missing", () => {
    assert.equal(
      shouldOfferSignoffEdit({ user: editor, config: null, status: "Pending" }),
      false
    );
  });
});
