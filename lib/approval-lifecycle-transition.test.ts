import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultApprovalLifecycleConfig,
  validateApprovalLifecycleConfig,
} from "@/lib/approval-lifecycle-config";
import {
  listLegalNextApprovalDecisions,
  resolveApprovalLifecycleStatusRef,
  validateApprovalTransition,
} from "@/lib/approval-lifecycle-transition";
import {
  deniedApprovalEditFields,
  resolveApprovalEditMode,
} from "@/lib/approval-lifecycle-edit-policy";

const config = createDefaultApprovalLifecycleConfig();

describe("default approval lifecycle", () => {
  it("validates the enterprise default graph", () => {
    assert.equal(validateApprovalLifecycleConfig(config), null);
  });
});

describe("resolveApprovalLifecycleStatusRef", () => {
  it("matches key, label, and Approved with Conditions alias", () => {
    assert.equal(resolveApprovalLifecycleStatusRef(config, "pending")?.key, "pending");
    assert.equal(resolveApprovalLifecycleStatusRef(config, "Deferred")?.key, "deferred");
    assert.equal(
      resolveApprovalLifecycleStatusRef(config, "Approved with Conditions")?.key,
      "approved"
    );
  });
});

describe("validateApprovalTransition", () => {
  it("allows Pending → Approved / Rejected / Deferred", () => {
    for (const to of ["Approved", "Rejected", "Deferred"] as const) {
      const result = validateApprovalTransition({
        config,
        fromStatus: "Pending",
        toStatus: to,
      });
      assert.equal(result.allowed, true);
      if (!result.allowed) return;
      assert.equal(result.canonicalStatus, to);
    }
  });

  it("blocks illegal Pending → Expired jump", () => {
    const result = validateApprovalTransition({
      config,
      fromStatus: "Pending",
      toStatus: "Expired",
    });
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.code, "ILLEGAL_TRANSITION");
  });

  it("blocks exit from Rejected / Withdrawn", () => {
    for (const from of ["Rejected", "Withdrawn"] as const) {
      const result = validateApprovalTransition({
        config,
        fromStatus: from,
        toStatus: "Pending",
      });
      assert.equal(result.allowed, false);
    }
  });

  it("allows Approved → Expired (AV-22) but blocks other Approved exits", () => {
    const expiry = validateApprovalTransition({
      config,
      fromStatus: "Approved",
      toStatus: "Expired",
    });
    assert.equal(expiry.allowed, true);

    const reopen = validateApprovalTransition({
      config,
      fromStatus: "Approved",
      toStatus: "Pending",
    });
    assert.equal(reopen.allowed, false);
  });

  it("blocks Deferred exits by default (no outgoing edges)", () => {
    const result = validateApprovalTransition({
      config,
      fromStatus: "Deferred",
      toStatus: "Pending",
    });
    assert.equal(result.allowed, false);
  });
});

describe("listLegalNextApprovalDecisions", () => {
  it("lists Pending next statuses", () => {
    const next = listLegalNextApprovalDecisions(config, "Pending");
    assert.ok(next.includes("Approved"));
    assert.ok(next.includes("Rejected"));
    assert.ok(next.includes("Deferred"));
    assert.ok(next.includes("Withdrawn"));
  });
});

describe("approval edit policy", () => {
  it("marks Approved/Rejected/Expired/Withdrawn immutable and Deferred full", () => {
    assert.equal(resolveApprovalEditMode(config, "Approved"), "immutable");
    assert.equal(resolveApprovalEditMode(config, "Rejected"), "immutable");
    assert.equal(resolveApprovalEditMode(config, "Expired"), "immutable");
    assert.equal(resolveApprovalEditMode(config, "Withdrawn"), "immutable");
    assert.equal(resolveApprovalEditMode(config, "Deferred"), "full");
    assert.equal(resolveApprovalEditMode(config, "Pending"), "full");
  });

  it("denies type edits on Approved but allows decision attempts", () => {
    const { denied } = deniedApprovalEditFields(config, "Approved", [
      "approvalType",
      "decision",
      "comments",
    ]);
    assert.ok(denied.includes("approvalType"));
    assert.ok(denied.includes("comments"));
    assert.equal(denied.includes("decision"), false);
  });
});
