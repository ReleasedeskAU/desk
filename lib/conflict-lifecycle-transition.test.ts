import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  conflictTransitionEnforcementLocked,
  createDefaultConflictLifecycleConfig,
  validateConflictLifecycleConfig,
} from "@/lib/conflict-lifecycle-config";
import {
  legalNextConflictStatuses,
  resolveConflictLifecycleStatusRef,
  validateConflictTransition,
} from "@/lib/conflict-lifecycle-transition";
import {
  deniedConflictEditFields,
  resolveConflictEditMode,
} from "@/lib/conflict-lifecycle-edit-policy";

const config = createDefaultConflictLifecycleConfig();

describe("default conflict lifecycle", () => {
  it("validates the 7-status graph, types, and checks", () => {
    assert.equal(validateConflictLifecycleConfig(config), null);
    assert.deepEqual(
      config.statuses.map((status) => status.label),
      [
        "Open",
        "In Progress",
        "Pending Review",
        "Escalated",
        "Resolved",
        "Closed",
        "Dismissed",
      ]
    );
    assert.equal(config.statuses.find((s) => s.key === "resolved")?.terminal, false);
    assert.equal(config.statuses.find((s) => s.key === "resolved")?.editMode, "full");
    assert.equal(config.statuses.find((s) => s.key === "closed")?.terminal, true);
    assert.equal(config.statuses.find((s) => s.key === "closed")?.editMode, "immutable");
    assert.ok(config.types.some((t) => t.key === "environment_booking"));
    assert.ok(config.types.some((t) => t.key === "maintenance_window"));
    assert.ok(config.types.some((t) => t.key === "freeze_period"));
  });
});

describe("resolveConflictLifecycleStatusRef", () => {
  it("maps Open / Detected and In Progress / Under Review aliases", () => {
    assert.equal(resolveConflictLifecycleStatusRef(config, "Open")?.key, "detected");
    assert.equal(resolveConflictLifecycleStatusRef(config, "Detected")?.key, "detected");
    assert.equal(
      resolveConflictLifecycleStatusRef(config, "In Progress")?.key,
      "under_review"
    );
    assert.equal(
      resolveConflictLifecycleStatusRef(config, "Under Review")?.key,
      "under_review"
    );
    assert.equal(
      resolveConflictLifecycleStatusRef(config, "Pending Review")?.key,
      "pending_review"
    );
    assert.equal(resolveConflictLifecycleStatusRef(config, "Escalated")?.key, "escalated");
    assert.equal(resolveConflictLifecycleStatusRef(config, "Closed")?.key, "closed");
  });
});

describe("legalNextConflictStatuses", () => {
  it("lists only sheet next steps from Open", () => {
    const next = legalNextConflictStatuses(config, "Open").map((s) => s.key);
    assert.deepEqual(next, ["under_review", "escalated"]);
  });

  it("lists no next steps from Closed or Dismissed", () => {
    assert.deepEqual(legalNextConflictStatuses(config, "Closed"), []);
    assert.deepEqual(legalNextConflictStatuses(config, "Dismissed"), []);
  });

  it("allows Resolved → Closed", () => {
    assert.deepEqual(
      legalNextConflictStatuses(config, "Resolved").map((s) => s.key),
      ["closed"]
    );
  });
});

describe("validateConflictTransition", () => {
  it("allows Open → In Progress and Open → Escalated", () => {
    for (const to of ["In Progress", "Escalated"] as const) {
      const result = validateConflictTransition({
        config,
        fromStatus: "Open",
        toStatus: to,
        facts: { notes: null, assignedTo: null },
      });
      assert.equal(result.allowed, true);
    }
  });

  it("blocks Open → Resolved (not a sheet edge)", () => {
    const result = validateConflictTransition({
      config,
      fromStatus: "Open",
      toStatus: "Resolved",
      facts: { notes: "ok", assignedTo: "RM" },
    });
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.code, "ILLEGAL_TRANSITION");
  });

  it("requires Assigned To before In Progress → Pending Review (Flexible override)", () => {
    const denied = validateConflictTransition({
      config,
      fromStatus: "In Progress",
      toStatus: "Pending Review",
      facts: { notes: null, assignedTo: null },
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

    const overridden = validateConflictTransition({
      config,
      fromStatus: "In Progress",
      toStatus: "Pending Review",
      overrideReason: "RM is on leave; I assessed it",
      facts: { notes: null, assignedTo: null },
    });
    assert.equal(overridden.allowed, true);
    if (!overridden.allowed) return;
    assert.equal(overridden.overridden, true);
  });

  it("hard-blocks Dismissed without notes even with an override reason", () => {
    const denied = validateConflictTransition({
      config,
      fromStatus: "Pending Review",
      toStatus: "Dismissed",
      overrideReason: "skip",
      facts: { notes: null, assignedTo: "RM" },
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "ILLEGAL_TRANSITION");
    assert.match(denied.reason, /cannot be overridden/i);
  });

  it("allows Dismissed when notes justify it", () => {
    const ok = validateConflictTransition({
      config,
      fromStatus: "Pending Review",
      toStatus: "Dismissed",
      facts: {
        notes: "False positive — different env region",
        assignedTo: "RM",
      },
    });
    assert.equal(ok.allowed, true);
  });

  it("blocks exit from Closed / Dismissed", () => {
    for (const from of ["Closed", "Dismissed"] as const) {
      const result = validateConflictTransition({
        config,
        fromStatus: from,
        toStatus: "Open",
        facts: { notes: "x", assignedTo: "x" },
      });
      assert.equal(result.allowed, false);
    }
  });

  it("allows Resolved → Closed", () => {
    const result = validateConflictTransition({
      config,
      fromStatus: "Resolved",
      toStatus: "Closed",
      facts: { notes: null, assignedTo: null },
    });
    assert.equal(result.allowed, true);
  });
});

describe("conflict edit policy", () => {
  it("keeps Resolved editable and Closed / Dismissed immutable", () => {
    assert.equal(resolveConflictEditMode(config, "Resolved"), "full");
    assert.equal(resolveConflictEditMode(config, "Closed"), "immutable");
    assert.equal(resolveConflictEditMode(config, "Dismissed"), "immutable");
    assert.equal(resolveConflictEditMode(config, "Open"), "full");
  });

  it("denies priority edits on Closed, not on Resolved", () => {
    const closed = deniedConflictEditFields(config, "Closed", ["priority", "status"]);
    assert.deepEqual(closed.denied, ["priority"]);
    const resolved = deniedConflictEditFields(config, "Resolved", [
      "priority",
      "status",
    ]);
    assert.deepEqual(resolved.denied, []);
  });
});

describe("conflictTransitionEnforcementLocked", () => {
  it("locks Flexible when an attached check is Required, without using a status key", () => {
    const dismiss = config.transitions.find(
      (t) => t.fromKey === "pending_review" && t.toKey === "dismissed"
    )!;
    assert.equal(conflictTransitionEnforcementLocked(dismiss), true);
    const start = config.transitions.find(
      (t) => t.fromKey === "detected" && t.toKey === "under_review"
    )!;
    assert.equal(conflictTransitionEnforcementLocked(start), false);
  });
});
