import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultApprovalLifecycleConfig,
  isApprovalTerminalExpiryExit,
  normalizeApprovalLifecycleConfig,
  validateApprovalLifecycleConfig,
} from "@/lib/approval-lifecycle-config";
import {
  approvalDecisionRevertsLinkedRelease,
  expectedFlexibleApprovalToKey,
  legalNextApprovalDecisions,
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

  it("treats Approved with Conditions as its own terminal status", () => {
    const status = config.statuses.find((s) => s.key === "approved_with_conditions");
    assert.ok(status);
    assert.equal(status.label, "Approved with Conditions");
    assert.equal(status.terminal, true);
    assert.equal(status.requiresConditions, true);
    assert.equal(status.editMode, "immutable");
  });

  it("flags Rejected to revert the linked release", () => {
    assert.equal(
      config.statuses.find((s) => s.key === "rejected")?.revertsLinkedReleaseOnEnter,
      true
    );
    assert.equal(approvalDecisionRevertsLinkedRelease(config, "Rejected"), true);
    assert.equal(approvalDecisionRevertsLinkedRelease(config, "Approved"), false);
  });
});

describe("resolveApprovalLifecycleStatusRef", () => {
  it("matches key, label, and Approved with Conditions as itself (not Approved)", () => {
    assert.equal(resolveApprovalLifecycleStatusRef(config, "pending")?.key, "pending");
    assert.equal(resolveApprovalLifecycleStatusRef(config, "Deferred")?.key, "deferred");
    assert.equal(
      resolveApprovalLifecycleStatusRef(config, "Approved with Conditions")?.key,
      "approved_with_conditions"
    );
    assert.notEqual(
      resolveApprovalLifecycleStatusRef(config, "Approved with Conditions")?.key,
      "approved"
    );
  });
});

describe("validateApprovalTransition", () => {
  it("allows Pending → Approved / Rejected / Deferred without a reason on the expected path only", () => {
    const approved = validateApprovalTransition({
      config,
      fromStatus: "Pending",
      toStatus: "Approved",
    });
    assert.equal(approved.allowed, true);
    if (!approved.allowed) return;
    assert.equal(approved.canonicalStatus, "Approved");
    assert.equal(approved.overridden, false);
  });

  it("requires overrideReason for unusual Flexible Pending decisions", () => {
    const blocked = validateApprovalTransition({
      config,
      fromStatus: "Pending",
      toStatus: "Rejected",
    });
    assert.equal(blocked.allowed, false);
    if (blocked.allowed) return;
    assert.equal(blocked.code, "TRANSITION_NEEDS_OVERRIDE");

    const ok = validateApprovalTransition({
      config,
      fromStatus: "Pending",
      toStatus: "Rejected",
      overrideReason: "Scope not ready for this CAB",
    });
    assert.equal(ok.allowed, true);
    if (!ok.allowed) return;
    assert.equal(ok.overridden, true);
  });

  it("requires conditions text when entering the requires-conditions status", () => {
    const missing = validateApprovalTransition({
      config,
      fromStatus: "Pending",
      toStatus: "Approved with Conditions",
      overrideReason: "qualified yes",
    });
    assert.equal(missing.allowed, false);
    if (missing.allowed) return;
    assert.equal(missing.code, "CONDITIONS_REQUIRED");

    const ok = validateApprovalTransition({
      config,
      fromStatus: "Pending",
      toStatus: "Approved with Conditions",
      conditions: "Deploy only after vendor patch lands",
    });
    assert.equal(ok.allowed, true);
    if (!ok.allowed) return;
    assert.equal(ok.canonicalStatus, "Approved with Conditions");
    assert.equal(ok.overridden, true);
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

  it("allows the expiryDays Required exit without using approved/expired keys", () => {
    const from = config.statuses.find((s) => s.expiryDays != null && s.expiryDays > 0)!;
    const edge = config.transitions.find(
      (t) => t.enabled && t.fromKey === from.key && t.enforcement === "required"
    )!;
    assert.equal(isApprovalTerminalExpiryExit(config, from, edge), true);

    const expiry = validateApprovalTransition({
      config,
      fromStatus: from.label,
      toStatus: config.statuses.find((s) => s.key === edge.toKey)!.label,
    });
    assert.equal(expiry.allowed, true);

    const reopen = validateApprovalTransition({
      config,
      fromStatus: from.label,
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

describe("legal next approval decisions", () => {
  it("lists Pending next statuses including Approved with Conditions", () => {
    const next = listLegalNextApprovalDecisions(config, "Pending");
    assert.ok(next.includes("Approved"));
    assert.ok(next.includes("Approved with Conditions"));
    assert.ok(next.includes("Rejected"));
    assert.ok(next.includes("Deferred"));
    assert.ok(next.includes("Withdrawn"));
  });

  it("hides the Required expiry edge from the Decision dropdown", () => {
    const next = legalNextApprovalDecisions(config, "Approved");
    assert.deepEqual(next, []);
  });

  it("treats lowest-sort Flexible as the expected path", () => {
    assert.equal(expectedFlexibleApprovalToKey(config, "pending"), "approved");
  });
});

describe("approval edit policy", () => {
  it("marks terminal decisions immutable and Deferred/Pending full", () => {
    assert.equal(resolveApprovalEditMode(config, "Approved"), "immutable");
    assert.equal(resolveApprovalEditMode(config, "Approved with Conditions"), "immutable");
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

describe("normalizeApprovalLifecycleConfig", () => {
  it("injects Approved with Conditions into an older six-status snapshot", () => {
    const older = {
      statuses: config.statuses
        .filter((s) => s.key !== "approved_with_conditions")
        .map((s) => ({ ...s, requiresConditions: false })),
      transitions: config.transitions.filter(
        (t) => t.toKey !== "approved_with_conditions"
      ),
    };
    const normalized = normalizeApprovalLifecycleConfig(older);
    assert.ok(normalized.statuses.some((s) => s.key === "approved_with_conditions"));
    assert.ok(
      normalized.transitions.some(
        (t) => t.fromKey === "pending" && t.toKey === "approved_with_conditions"
      )
    );
    assert.equal(validateApprovalLifecycleConfig(normalized), null);
  });
});
