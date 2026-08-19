/**
 * Run: npx tsx --test lib/validation/conflict.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONFLICT_TYPES, mergeConflictTypes } from "./conflict";

describe("mergeConflictTypes", () => {
  it("keeps Schedule / Resource / Application first", () => {
    assert.deepEqual(mergeConflictTypes([]), [...CONFLICT_TYPES]);
  });

  it("appends extra labels and drops blanks / duplicates", () => {
    assert.deepEqual(mergeConflictTypes(["Environment Booking", "Schedule", "  ", "Freeze Period"]), [
      "Schedule",
      "Resource",
      "Application",
      "Environment Booking",
      "Freeze Period",
    ]);
  });
});
