import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignmentOptionsToSelect } from "@/lib/release-assignment-options";

describe("release assignment select options", () => {
  it("maps tenant-scoped assignment rows onto select values", () => {
    const options = assignmentOptionsToSelect([
      { id: "user_a", label: "USR-1 — Ada" },
      { id: "user_b", label: "USR-2 — Beau" },
    ]);
    assert.deepEqual(options, [
      { value: "user_a", label: "USR-1 — Ada" },
      { value: "user_b", label: "USR-2 — Beau" },
    ]);
  });

  it("returns an empty list when the tenant payload is missing", () => {
    assert.deepEqual(assignmentOptionsToSelect(undefined), []);
    assert.deepEqual(assignmentOptionsToSelect([]), []);
  });
});
