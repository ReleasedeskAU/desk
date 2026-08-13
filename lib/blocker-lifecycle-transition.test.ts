import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultBlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config";
import { reconcileBlockerLifecycleSpec } from "@/lib/blocker-lifecycle-spec-reconcile";
import {
  blockerStatusBlocksReleaseReady,
  evaluateBlockerGate,
  legalNextBlockerStatuses,
  resolveBlockerLifecycleStatusRef,
  validateBlockerTransition,
} from "@/lib/blocker-lifecycle-transition";
import { blockerGate } from "@/lib/blocker-lifecycle-gates";
import {
  deniedBlockerEditFields,
  resolveBlockerEditMode,
} from "@/lib/blocker-lifecycle-edit-policy";

const emptyFacts = {
  assignedTo: null,
  resolutionNotes: null,
  rootCause: null,
};
const ownedFacts = {
  assignedTo: "Ada",
  resolutionNotes: "Waiting on vendor",
  rootCause: "Vendor delay",
};

const config = createDefaultBlockerLifecycleConfig();

describe("resolveBlockerLifecycleStatusRef", () => {
  it("matches by key and by label (case-insensitive)", () => {
    assert.equal(resolveBlockerLifecycleStatusRef(config, "open")?.key, "open");
    assert.equal(resolveBlockerLifecycleStatusRef(config, "Assigned")?.key, "assigned");
    assert.equal(resolveBlockerLifecycleStatusRef(config, "PENDING")?.key, "pending");
  });
});

describe("legalNextBlockerStatuses", () => {
  it("lists sheet next plus kept extras from Open", () => {
    const next = legalNextBlockerStatuses(config, "Open").map((s) => s.key);
    assert.deepEqual(next, ["assigned", "escalated", "in_progress", "cancelled"]);
  });

  it("lists no exits from Closed", () => {
    assert.deepEqual(legalNextBlockerStatuses(config, "Closed"), []);
  });
});

describe("validateBlockerTransition", () => {
  it("requires owner (or override) on Open → Assigned", () => {
    const denied = validateBlockerTransition({
      config,
      fromStatus: "Open",
      toStatus: "Assigned",
      facts: emptyFacts,
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

    const overridden = validateBlockerTransition({
      config,
      fromStatus: "Open",
      toStatus: "Assigned",
      facts: emptyFacts,
      overrideReason: "Owner TBD — RM covering today",
    });
    assert.equal(overridden.allowed, true);

    const owned = validateBlockerTransition({
      config,
      fromStatus: "Open",
      toStatus: "Assigned",
      facts: ownedFacts,
    });
    assert.equal(owned.allowed, true);
    if (!owned.allowed) return;
    assert.equal(owned.overridden, false);
  });

  it("requires a waiting-on note for In Progress → Pending", () => {
    const denied = validateBlockerTransition({
      config,
      fromStatus: "In Progress",
      toStatus: "Pending",
      facts: { assignedTo: "Ada", resolutionNotes: null, rootCause: null },
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");
  });

  it("blocks illegal Open → Closed jump", () => {
    const result = validateBlockerTransition({
      config,
      fromStatus: "Open",
      toStatus: "Closed",
      facts: ownedFacts,
    });
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.code, "ILLEGAL_TRANSITION");
  });

  it("blocks any exit from terminal Closed", () => {
    const result = validateBlockerTransition({
      config,
      fromStatus: "Closed",
      toStatus: "Reopened",
      facts: ownedFacts,
    });
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.code, "ILLEGAL_TRANSITION");
  });

  it("allows Resolved → Reopened and Reopened → In Progress", () => {
    const reopen = validateBlockerTransition({
      config,
      fromStatus: "Resolved",
      toStatus: "Reopened",
      facts: ownedFacts,
    });
    assert.equal(reopen.allowed, true);
    const progress = validateBlockerTransition({
      config,
      fromStatus: "Reopened",
      toStatus: "In Progress",
      facts: ownedFacts,
    });
    assert.equal(progress.allowed, true);
  });
});

describe("evaluateBlockerGate", () => {
  it("fails assignee_set when Assigned To is empty", () => {
    const unmet = evaluateBlockerGate(blockerGate("assignee_set", 10), emptyFacts);
    assert.ok(unmet);
  });
});

describe("blockerStatusBlocksReleaseReady", () => {
  it("blocks Ready for open-like statuses and not for Resolved/Closed/Cancelled", () => {
    assert.equal(blockerStatusBlocksReleaseReady(config, "Open"), true);
    assert.equal(blockerStatusBlocksReleaseReady(config, "Assigned"), true);
    assert.equal(blockerStatusBlocksReleaseReady(config, "Pending"), true);
    assert.equal(blockerStatusBlocksReleaseReady(config, "Escalated"), true);
    assert.equal(blockerStatusBlocksReleaseReady(config, "Reopened"), true);
    assert.equal(blockerStatusBlocksReleaseReady(config, "Resolved"), false);
    assert.equal(blockerStatusBlocksReleaseReady(config, "Closed"), false);
    assert.equal(blockerStatusBlocksReleaseReady(config, "Cancelled"), false);
  });
});

describe("blocker edit policy", () => {
  it("marks Closed/Cancelled immutable and Resolved limited", () => {
    assert.equal(resolveBlockerEditMode(config, "Closed"), "immutable");
    assert.equal(resolveBlockerEditMode(config, "Cancelled"), "immutable");
    assert.equal(resolveBlockerEditMode(config, "Resolved"), "limited");
    assert.equal(resolveBlockerEditMode(config, "Open"), "full");
  });

  it("locks resolution details on Resolved but allows status (Reopened)", () => {
    const { denied } = deniedBlockerEditFields(config, "Resolved", [
      "rootCause",
      "resolutionNotes",
      "status",
    ]);
    assert.deepEqual(denied.sort(), ["resolutionNotes", "rootCause"]);
  });

  it("denies description edits on Closed but allows status attempts", () => {
    const { denied } = deniedBlockerEditFields(config, "Closed", [
      "blockerDescription",
      "status",
    ]);
    assert.deepEqual(denied, ["blockerDescription"]);
  });
});

describe("reconcileBlockerLifecycleSpec", () => {
  it("adds Assigned and Pending to an older 7-status snapshot", () => {
    const old = createDefaultBlockerLifecycleConfig();
    old.statuses = old.statuses.filter(
      (s) => s.key !== "assigned" && s.key !== "pending"
    );
    old.transitions = old.transitions.filter(
      (t) => t.fromKey !== "assigned" && t.toKey !== "assigned" &&
        t.fromKey !== "pending" && t.toKey !== "pending"
    );
    const next = reconcileBlockerLifecycleSpec(old);
    assert.ok(next.statuses.some((s) => s.key === "assigned"));
    assert.ok(next.statuses.some((s) => s.key === "pending"));
    assert.ok(
      next.transitions.some((t) => t.fromKey === "open" && t.toKey === "assigned")
    );
  });
});
