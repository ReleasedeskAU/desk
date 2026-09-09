import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RELEASE_NAME_PENDING_CAB_DENIED_MESSAGE } from "@/lib/edit-policy-user-message";
import { buildReleaseFormSaveAlert } from "@/lib/release-form-save-alert";

describe("buildReleaseFormSaveAlert", () => {
  it("titles lifecycle transition denials as status blocked", () => {
    const alert = buildReleaseFormSaveAlert(
      {
        error:
          'You can’t move this release from “Draft” to “Deploying”. That step isn’t allowed from here.',
        code: "ILLEGAL_TRANSITION",
      },
      "Failed to save release"
    );
    assert.equal(alert.title, "Status change blocked");
    assert.match(alert.message, /Deploying/);
    assert.equal(alert.details, undefined);
  });

  it("includes unmet gate reasons as details", () => {
    const alert = buildReleaseFormSaveAlert(
      {
        error: "Required gates are not met for this transition",
        code: "TRANSITION_BLOCKED",
        transition: {
          unmetReasons: ["Release owner is required", "Release size is required"],
        },
      },
      "Failed to save release"
    );
    assert.equal(alert.title, "Status change blocked");
    assert.deepEqual(alert.details, [
      "Release owner is required",
      "Release size is required",
    ]);
  });

  it("uses a generic title for non-lifecycle failures", () => {
    const alert = buildReleaseFormSaveAlert(
      { error: "Department not found" },
      "Failed to save release"
    );
    assert.equal(alert.title, "Could not save release");
    assert.equal(alert.message, "Department not found");
  });

  it("titles recorded sign-off flips as can’t be changed", () => {
    const alert = buildReleaseFormSaveAlert(
      {
        error:
          "Business Review is already recorded as “Approved”. Recorded decisions can’t be changed — ask an admin if you need a new request.",
        code: "EDIT_POLICY_DENIED",
        field: "businessSignoff",
      },
      "Failed to save release"
    );
    assert.equal(alert.title, "This sign-off can’t be changed");
    assert.match(alert.message, /Business Review/);
  });

  it("falls back when body has no error field", () => {
    const alert = buildReleaseFormSaveAlert(null, "Failed to save release");
    assert.equal(alert.message, "Failed to save release");
    assert.equal(alert.title, "Could not save release");
  });

  it("shows a plain name-lock dialog at pending CAB, not a technical code (RD-141)", () => {
    const alert = buildReleaseFormSaveAlert(
      {
        error: RELEASE_NAME_PENDING_CAB_DENIED_MESSAGE,
        code: "EDIT_POLICY_DENIED",
        field: "name",
        denied: ["name"],
        mode: "limited",
      },
      "Failed to save release"
    );
    assert.equal(alert.title, "Release name can’t be changed");
    assert.match(alert.message, /can’t be changed at this stage/i);
    assert.match(alert.message, /release manager/i);
    assert.equal(alert.message.includes("EDIT_POLICY_DENIED"), false);
    assert.doesNotMatch(alert.message, /\blimited\b/);
    assert.doesNotMatch(alert.message, /Fields affected:\s*name/);
    assert.doesNotMatch(alert.title, /Status change blocked/);
  });

  it("keeps a clear message for a missing required field (not the name-lock copy)", () => {
    const alert = buildReleaseFormSaveAlert(
      { error: "Release name is required" },
      "Failed to save release"
    );
    assert.equal(alert.message, "Release name is required");
    assert.doesNotMatch(alert.message, /ask a release manager/i);
    assert.equal(alert.title, "Could not save release");
  });
});
