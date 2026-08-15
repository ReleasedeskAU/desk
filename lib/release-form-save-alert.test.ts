import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
});
