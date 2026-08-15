import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultDriftLifecycleConfig,
  type DriftLifecycleConfig,
} from "@/lib/drift-lifecycle-config";
import { reconcileDriftLifecycleSpec } from "@/lib/drift-lifecycle-spec-reconcile";

function legacyFiveStatusGraph(): DriftLifecycleConfig {
  return {
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
        escalateTarget: false,
      },
      {
        key: "investigating",
        label: "Investigating",
        sortOrder: 20,
        terminal: false,
        enabled: true,
        isSystem: true,
        editMode: "full",
        cascadeEffect: "review",
        isIntake: false,
        escalateTarget: false,
      },
      {
        key: "approved",
        label: "Approved",
        sortOrder: 30,
        terminal: true,
        enabled: true,
        isSystem: true,
        editMode: "immutable",
        cascadeEffect: "final",
        isIntake: false,
        escalateTarget: false,
      },
      {
        key: "reverted",
        label: "Reverted",
        sortOrder: 40,
        terminal: true,
        enabled: true,
        isSystem: true,
        editMode: "immutable",
        cascadeEffect: "final",
        isIntake: false,
        escalateTarget: false,
      },
      {
        key: "escalated",
        label: "Escalated",
        sortOrder: 50,
        terminal: false,
        enabled: true,
        isSystem: true,
        editMode: "full",
        cascadeEffect: "up",
        isIntake: false,
        escalateTarget: true,
      },
    ],
    transitions: [
      {
        fromKey: "detected",
        toKey: "investigating",
        enabled: true,
        enforcement: "flexible",
        isSystem: true,
        sortOrder: 10,
        gates: [],
      },
      {
        fromKey: "detected",
        toKey: "approved",
        enabled: true,
        enforcement: "flexible",
        isSystem: true,
        sortOrder: 20,
        gates: [],
      },
      {
        fromKey: "detected",
        toKey: "reverted",
        enabled: true,
        enforcement: "flexible",
        isSystem: true,
        sortOrder: 30,
        gates: [],
      },
    ],
  };
}

describe("reconcileDriftLifecycleSpec", () => {
  it("relabels Detected / Investigating / Approved and expands the graph", () => {
    const reconciled = reconcileDriftLifecycleSpec(legacyFiveStatusGraph());

    assert.equal(
      reconciled.statuses.find((status) => status.key === "detected")?.label,
      "Open"
    );
    assert.equal(
      reconciled.statuses.find((status) => status.key === "investigating")?.label,
      "In Progress"
    );
    const approved = reconciled.statuses.find((status) => status.key === "approved");
    assert.equal(approved?.label, "Resolved");
    assert.equal(approved?.terminal, false);
    assert.equal(approved?.editMode, "limited");
    assert.equal(
      reconciled.statuses.find((status) => status.key === "reverted")?.terminal,
      true
    );
    assert.ok(reconciled.statuses.some((status) => status.key === "scheduled"));
    assert.ok(reconciled.statuses.some((status) => status.key === "closed"));
    assert.ok(
      reconciled.transitions.some(
        (transition) =>
          transition.fromKey === "detected" && transition.toKey === "escalated"
      )
    );
    assert.ok(
      reconciled.transitions.some(
        (transition) =>
          transition.fromKey === "approved" && transition.toKey === "closed"
      )
    );
    const toResolved = reconciled.transitions.find(
      (transition) =>
        transition.fromKey === "investigating" && transition.toKey === "approved"
    );
    assert.ok(
      toResolved?.gates.some((gate) => gate.gateType === "new_baseline_established")
    );
  });

  it("preserves a user-renamed display label and extra edge", () => {
    const custom = createDefaultDriftLifecycleConfig();
    custom.statuses.find((status) => status.key === "detected")!.label = "Raised";
    custom.transitions.push({
      fromKey: "scheduled",
      toKey: "reverted",
      enabled: true,
      enforcement: "flexible",
      isSystem: false,
      sortOrder: 99,
      gates: [],
    });

    const reconciled = reconcileDriftLifecycleSpec(custom);

    assert.equal(
      reconciled.statuses.find((status) => status.key === "detected")?.label,
      "Raised"
    );
    assert.ok(
      reconciled.transitions.some(
        (transition) =>
          transition.fromKey === "scheduled" && transition.toKey === "reverted"
      )
    );
  });
});
