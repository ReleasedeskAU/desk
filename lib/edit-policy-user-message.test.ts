/**
 * Unit tests for edit-policy user-facing messages.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import { resolveLifecycleStatusRef } from "@/lib/release-lifecycle-transition";
import { deniedReleaseEditFields } from "@/lib/release-lifecycle-edit-policy";
import {
  editPolicyDeniedMessage,
  RELEASE_NAME_PENDING_CAB_DENIED_MESSAGE,
  releaseEditPolicyDeniedError,
} from "@/lib/edit-policy-user-message";

describe("editPolicyDeniedMessage", () => {
  it("explains immutable without raw mode tokens", () => {
    const msg = editPolicyDeniedMessage({
      entity: "release",
      mode: "immutable",
      statusLabel: "Closed",
      deniedFields: ["notes", "owner"],
    });
    assert.match(msg, /can’t be edited in “Closed”/i);
    assert.match(msg, /locked after that decision/i);
    assert.match(msg, /notes, owner/);
    assert.doesNotMatch(msg, /immutable/);
  });

  it("uses decision wording for approvals", () => {
    const msg = editPolicyDeniedMessage({
      entity: "approval",
      mode: "immutable",
      statusLabel: "Approved",
      statusWord: "decision",
      deniedFields: ["comments"],
    });
    assert.match(msg, /approval/);
    assert.match(msg, /Approved/);
  });
});

describe("releaseEditPolicyDeniedError (RD-141)", () => {
  const config = createDefaultReleaseLifecycleConfig();

  function assertPlainNameLockCopy(error: string) {
    assert.equal(error, RELEASE_NAME_PENDING_CAB_DENIED_MESSAGE);
    assert.doesNotMatch(error, /EDIT_POLICY_DENIED|FIELD_LOCK_DENIED/);
    assert.doesNotMatch(error, /\blimited\b/);
    assert.doesNotMatch(error, /Fields affected:\s*name/);
  }

  it("returns a plain message for a name change at pending CAB (key or tenant label)", () => {
    const { denied, mode } = deniedReleaseEditFields(config, "Pending CAB", [
      "name",
    ]);
    assert.deepEqual(denied, ["name"]);
    const byLabel = releaseEditPolicyDeniedError({
      mode,
      statusLabel: "Pending CAB",
      statusKey: resolveLifecycleStatusRef(config, "Pending CAB")?.key ?? null,
      deniedFields: denied,
    });
    assertPlainNameLockCopy(byLabel.error);
    assert.equal(byLabel.field, "name");

    const byKey = releaseEditPolicyDeniedError({
      mode,
      statusLabel: "Pending CAB",
      statusKey: resolveLifecycleStatusRef(config, "pending_cab")?.key ?? null,
      deniedFields: ["name"],
    });
    assertPlainNameLockCopy(byKey.error);

    const renamed = {
      ...config,
      statuses: config.statuses.map((s) =>
        s.key === "pending_cab" ? { ...s, label: "Pending approval" } : s
      ),
    };
    const renamedRef = resolveLifecycleStatusRef(renamed, "Pending approval");
    assert.equal(renamedRef?.key, "pending_cab");
    const byRenamedLabel = releaseEditPolicyDeniedError({
      mode,
      statusLabel: renamedRef!.label,
      statusKey: renamedRef!.key,
      deniedFields: ["name"],
    });
    assertPlainNameLockCopy(byRenamedLabel.error);
    assert.doesNotMatch(byRenamedLabel.error, /Pending approval/i);
  });

  it("does not use the name-lock message when name is still editable (Planning)", () => {
    const { denied } = deniedReleaseEditFields(config, "Planning", ["name"]);
    assert.deepEqual(denied, []);
    const result = releaseEditPolicyDeniedError({
      mode: "full",
      statusLabel: "Planning",
      statusKey: resolveLifecycleStatusRef(config, "Planning")?.key ?? null,
      deniedFields: ["name"],
    });
    assert.doesNotMatch(result.error, /ask a release manager/i);
    assert.doesNotMatch(result.error, /at this stage/);
    assert.equal(result.field, undefined);
  });

  it("does not invent a field-lock catalog rule for name at pending_cab", () => {
    const src = readFileSync("lib/release-field-lock-catalog.ts", "utf8");
    const nameEntry = src.match(
      /fieldKey:\s*"name",[\s\S]*?defaultRules:\s*rulesEditableUntil\("([^"]+)"\)/
    );
    assert.equal(nameEntry?.[1], "deploying");
  });

  it("PATCH /api/releases/[id] uses the plain pending-CAB name copy", () => {
    const src = readFileSync("app/api/releases/[id]/route.ts", "utf8");
    assert.match(src, /releaseEditPolicyDeniedError/);
    assert.doesNotMatch(src, /editPolicyDeniedMessage\(/);
  });
});
