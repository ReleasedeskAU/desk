import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DRIFT_TYPES, driftTypeOptions, isDriftType } from "@/lib/drift-types";

describe("drift types", () => {
  it("accepts the six sheet types including Code", () => {
    assert.deepEqual([...DRIFT_TYPES], [
      "Infrastructure",
      "Configuration",
      "Data",
      "Integration",
      "Security",
      "Code",
    ]);
    assert.equal(isDriftType("Code"), true);
    assert.equal(isDriftType("Database Version"), false);
  });

  it("keeps an unknown current value visible in the select", () => {
    const options = driftTypeOptions("Legacy Type");
    assert.ok(options.some((option) => option.value === "Code"));
    assert.ok(options.some((option) => option.value === "Legacy Type"));
  });
});
