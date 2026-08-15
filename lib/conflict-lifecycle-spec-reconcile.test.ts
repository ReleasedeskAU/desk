import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultConflictLifecycleConfig,
  type ConflictLifecycleConfig,
} from "@/lib/conflict-lifecycle-config";
import { reconcileConflictLifecycleSpec } from "@/lib/conflict-lifecycle-spec-reconcile";

describe("reconcileConflictLifecycleSpec", () => {
  it("relabels untouched Detected / Under Review and expands the 4-status graph", () => {
    const legacy: ConflictLifecycleConfig = {
      statuses: [
        {
          key: "detected",
          label: "Detected",
          sortOrder: 10,
          terminal: false,
          enabled: true,
          isSystem: true,
          editMode: "full",
          cascadeEffect: "intake",
          isIntake: true,
          blocksReleaseReady: true,
        },
        {
          key: "under_review",
          label: "Under Review",
          sortOrder: 20,
          terminal: false,
          enabled: true,
          isSystem: true,
          editMode: "full",
          cascadeEffect: "review",
          isIntake: false,
          blocksReleaseReady: true,
        },
        {
          key: "resolved",
          label: "Resolved",
          sortOrder: 30,
          terminal: true,
          enabled: true,
          isSystem: true,
          editMode: "immutable",
          cascadeEffect: "final",
          isIntake: false,
          blocksReleaseReady: false,
        },
        {
          key: "dismissed",
          label: "Dismissed",
          sortOrder: 40,
          terminal: true,
          enabled: true,
          isSystem: true,
          editMode: "immutable",
          cascadeEffect: "final",
          isIntake: false,
          blocksReleaseReady: false,
        },
      ],
      transitions: [
        {
          fromKey: "detected",
          toKey: "under_review",
          enabled: true,
          enforcement: "flexible",
          isSystem: true,
          sortOrder: 10,
          gates: [],
        },
        {
          fromKey: "under_review",
          toKey: "resolved",
          enabled: true,
          enforcement: "flexible",
          isSystem: true,
          sortOrder: 10,
          gates: [],
        },
      ],
      types: [
        {
          key: "schedule",
          label: "Schedule",
          sortOrder: 10,
          enabled: true,
          isSystem: true,
          description: "same day",
        },
      ],
    };

    const reconciled = reconcileConflictLifecycleSpec(legacy);

    assert.equal(
      reconciled.statuses.find((status) => status.key === "detected")?.label,
      "Open"
    );
    assert.equal(
      reconciled.statuses.find((status) => status.key === "under_review")?.label,
      "In Progress"
    );
    assert.equal(
      reconciled.statuses.find((status) => status.key === "resolved")?.terminal,
      false
    );
    assert.equal(
      reconciled.statuses.find((status) => status.key === "resolved")?.editMode,
      "full"
    );
    assert.ok(reconciled.statuses.some((status) => status.key === "pending_review"));
    assert.ok(reconciled.statuses.some((status) => status.key === "escalated"));
    assert.ok(reconciled.statuses.some((status) => status.key === "closed"));
    assert.ok(
      reconciled.transitions.some(
        (transition) =>
          transition.fromKey === "resolved" && transition.toKey === "closed"
      )
    );
    assert.ok(reconciled.types.some((type) => type.key === "environment_booking"));
    const dismiss = reconciled.transitions.find(
      (transition) =>
        transition.fromKey === "pending_review" &&
        transition.toKey === "dismissed"
    );
    assert.equal(dismiss?.enforcement, "required");
    assert.ok(
      dismiss?.gates.some((gate) => gate.gateType === "dismissal_justification_set")
    );
  });

  it("preserves a user-renamed display label and extra edge", () => {
    const custom = createDefaultConflictLifecycleConfig();
    custom.statuses.find((status) => status.key === "detected")!.label = "Raised";
    custom.transitions.push({
      fromKey: "detected",
      toKey: "resolved",
      enabled: true,
      enforcement: "flexible",
      isSystem: false,
      sortOrder: 99,
      gates: [],
    });

    const reconciled = reconcileConflictLifecycleSpec(custom);

    assert.equal(
      reconciled.statuses.find((status) => status.key === "detected")?.label,
      "Raised"
    );
    assert.ok(
      reconciled.transitions.some(
        (transition) =>
          transition.fromKey === "detected" && transition.toKey === "resolved"
      )
    );
  });
});
