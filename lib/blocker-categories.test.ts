/**
 * Run: npx tsx --test lib/blocker-categories.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BLOCKER_CATEGORIES, isBlockerCategory } from "@/lib/blocker-categories";

describe("blocker categories", () => {
  it("has the live 12 plus Approval, Data, Vendor", () => {
    assert.equal(BLOCKER_CATEGORIES.length, 15);
    assert.ok(isBlockerCategory("Technical"));
    assert.ok(isBlockerCategory("Approval"));
    assert.ok(isBlockerCategory("Data"));
    assert.ok(isBlockerCategory("Vendor"));
    assert.equal(isBlockerCategory("NotACategory"), false);
    assert.equal(isBlockerCategory(""), false);
  });
});
