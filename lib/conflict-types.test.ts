import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  conflictTypeOptions,
  isConflictType,
  isLegacyConflictType,
} from "@/lib/conflict-types";

describe("conflict types", () => {
  it("accepts the six sheet types plus leftover seed strings", () => {
    assert.equal(isConflictType("Environment Booking"), true);
    assert.equal(isConflictType("Maintenance Window"), true);
    assert.equal(isConflictType("Freeze Period"), true);
    assert.equal(isConflictType("Schedule"), true);
    assert.equal(isConflictType("Same Test/UAT env required"), true);
    assert.equal(isLegacyConflictType("Same Test/UAT env required"), true);
    assert.equal(isConflictType("Not a type"), false);
  });

  it("keeps leftover values visible on edit without replacing the catalog", () => {
    const options = conflictTypeOptions("Same Test/UAT env required");
    assert.ok(options.some((option) => option.value === "Environment Booking"));
    assert.ok(options.some((option) => option.value === "Same Test/UAT env required"));
  });
});
