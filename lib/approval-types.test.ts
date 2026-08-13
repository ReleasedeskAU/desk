/**
 * Run: npx tsx --test lib/approval-types.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPROVAL_TYPES,
  LEGACY_APPROVAL_TYPES,
  approvalTypeSelectOptions,
  createApprovalSchema,
  isKnownApprovalType,
  isLegacyApprovalType,
  patchApprovalSchema,
} from "@/lib/validation/approval";

describe("approval types", () => {
  it("exposes the sheet’s four types", () => {
    assert.deepEqual([...APPROVAL_TYPES], [
      "CAB Final",
      "Change Manager",
      "Executive Approval",
      "Emergency Approval",
    ]);
  });

  it("accepts legacy types so existing rows do not fail validation", () => {
    for (const legacy of LEGACY_APPROVAL_TYPES) {
      assert.equal(isKnownApprovalType(legacy), true);
      assert.equal(isLegacyApprovalType(legacy), true);
    }
    assert.equal(isKnownApprovalType("Not a type"), false);
  });

  it("flags leftover types in the select without dropping them", () => {
    const opts = approvalTypeSelectOptions("Tech Review");
    assert.equal(opts[0]?.value, "Tech Review");
    assert.match(opts[0]!.label, /previous type/);
    assert.ok(opts.some((o) => o.value === "CAB Final"));
  });

  it("rejects unknown types on POST and PATCH", () => {
    const created = createApprovalSchema.safeParse({
      releaseId: "rel_1",
      approvalType: "Mystery Gate",
      approverId: "usr_1",
      submittedDate: "2026-08-01",
    });
    assert.equal(created.success, false);

    const patched = patchApprovalSchema.safeParse({
      approvalType: "Mystery Gate",
    });
    assert.equal(patched.success, false);

    const legacyPatch = patchApprovalSchema.safeParse({
      approvalType: "Tech Review",
    });
    assert.equal(legacyPatch.success, true);
  });
});
