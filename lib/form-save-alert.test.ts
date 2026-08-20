/**
 * Shared save-failure alert titles (lifecycle vs field lock vs generic).
 * Run: npx tsx --test lib/form-save-alert.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFormSaveAlert } from "@/lib/form-save-alert";

describe("buildFormSaveAlert", () => {
  it("titles FIELD_LOCK_DENIED as This field is locked and keeps the API error", () => {
    const alert = buildFormSaveAlert(
      {
        error: "“Severity” can’t be changed while this blocker is Resolved.",
        code: "FIELD_LOCK_DENIED",
      },
      "Couldn’t save changes. Try again.",
      { entityLabel: "blocker" }
    );
    assert.equal(alert.title, "This field is locked");
    assert.match(alert.message, /Severity.+Resolved/);
    assert.equal(alert.message.includes("FIELD_LOCK_DENIED"), false);
  });

  it("titles lifecycle codes as Status change blocked", () => {
    const alert = buildFormSaveAlert(
      { error: "That step isn’t allowed from here.", code: "ILLEGAL_TRANSITION" },
      "Could not save blocker",
      { entityLabel: "blocker" }
    );
    assert.equal(alert.title, "Status change blocked");
  });

  it("uses a generic title for other failures", () => {
    const alert = buildFormSaveAlert(
      { error: "Release not found" },
      "Failed to create blocker",
      { entityLabel: "blocker" }
    );
    assert.equal(alert.title, "Could not save blocker");
    assert.equal(alert.message, "Release not found");
  });
});
