import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicStafflessError } from "./client";

describe("publicStafflessError", () => {
  it("does not echo upstream bodies", () => {
    assert.equal(publicStafflessError(401), "StaffLess AI rejected the request");
    assert.equal(publicStafflessError(500), "StaffLess AI is unavailable");
    assert.ok(!publicStafflessError(422).includes("index_name"));
  });
});
