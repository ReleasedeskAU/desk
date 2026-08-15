import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatStakeholderNames } from "./release-stakeholder-display";

describe("formatStakeholderNames", () => {
  it("joins real names and skips raw-code-only display when a name exists", () => {
    assert.equal(
      formatStakeholderNames([
        { user: { userId: "USR-001", name: "Ada Lovelace" } },
        { user: { userId: "USR-002", name: "Grace Hopper" } },
      ]),
      "Ada Lovelace, Grace Hopper"
    );
  });

  it("falls back to the directory id when name is missing", () => {
    assert.equal(
      formatStakeholderNames([{ user: { userId: "USR-009", name: "" } }]),
      "USR-009"
    );
  });

  it("returns an em dash when the list is empty", () => {
    assert.equal(formatStakeholderNames([]), "—");
    assert.equal(formatStakeholderNames(undefined), "—");
  });
});
