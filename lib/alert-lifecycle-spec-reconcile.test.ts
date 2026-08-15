import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultAlertLifecycleConfig,
  type AlertLifecycleConfig,
} from "@/lib/alert-lifecycle-config";
import { reconcileAlertLifecycleSpec } from "@/lib/alert-lifecycle-spec-reconcile";

function legacyFiveStatusGraph(): AlertLifecycleConfig {
  return {
    statuses: [
      {
        key: "pending",
        label: "Pending",
        sortOrder: 10,
        terminal: false,
        enabled: true,
        isSystem: true,
        editMode: "full",
        cascadeEffect: "intake",
        isIntake: true,
        suppressesRepeatAlerts: false,
        expiryDays: null,
      },
      {
        key: "acknowledged",
        label: "Acknowledged",
        sortOrder: 20,
        terminal: false,
        enabled: true,
        isSystem: true,
        editMode: "limited",
        cascadeEffect: "seen",
        isIntake: false,
        suppressesRepeatAlerts: true,
        expiryDays: null,
      },
      {
        key: "actioned",
        label: "Actioned",
        sortOrder: 30,
        terminal: true,
        enabled: true,
        isSystem: true,
        editMode: "immutable",
        cascadeEffect: "final",
        isIntake: false,
        suppressesRepeatAlerts: false,
        expiryDays: null,
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
        suppressesRepeatAlerts: false,
        expiryDays: null,
      },
      {
        key: "expired",
        label: "Expired",
        sortOrder: 50,
        terminal: true,
        enabled: true,
        isSystem: true,
        editMode: "immutable",
        cascadeEffect: "final",
        isIntake: false,
        suppressesRepeatAlerts: false,
        expiryDays: null,
      },
    ],
    transitions: [
      {
        fromKey: "pending",
        toKey: "acknowledged",
        enabled: true,
        enforcement: "flexible",
        isSystem: true,
        sortOrder: 10,
        gates: [],
      },
      {
        fromKey: "pending",
        toKey: "dismissed",
        enabled: true,
        enforcement: "flexible",
        isSystem: true,
        sortOrder: 20,
        gates: [],
      },
      {
        fromKey: "acknowledged",
        toKey: "actioned",
        enabled: true,
        enforcement: "flexible",
        isSystem: true,
        sortOrder: 10,
        gates: [],
      },
    ],
    types: [
      {
        key: "warning",
        label: "Warning",
        sortOrder: 20,
        enabled: true,
        isSystem: true,
        description: "threshold",
      },
    ],
  };
}

describe("reconcileAlertLifecycleSpec", () => {
  it("relabels Pending / Actioned and expands the 5-status graph", () => {
    const reconciled = reconcileAlertLifecycleSpec(legacyFiveStatusGraph());

    assert.equal(
      reconciled.statuses.find((status) => status.key === "pending")?.label,
      "Active"
    );
    const actioned = reconciled.statuses.find((status) => status.key === "actioned");
    assert.equal(actioned?.label, "Resolved");
    assert.equal(actioned?.terminal, false);
    assert.equal(actioned?.editMode, "limited");
    assert.ok(reconciled.statuses.some((status) => status.key === "investigating"));
    assert.ok(reconciled.statuses.some((status) => status.key === "escalated"));
    assert.ok(reconciled.statuses.some((status) => status.key === "closed"));
    assert.ok(
      reconciled.transitions.some(
        (transition) =>
          transition.fromKey === "actioned" && transition.toKey === "closed"
      )
    );
    const expire = reconciled.transitions.find(
      (transition) =>
        transition.fromKey === "pending" && transition.toKey === "expired"
    );
    assert.equal(expire?.enforcement, "required");
    const dismiss = reconciled.transitions.find(
      (transition) =>
        transition.fromKey === "pending" && transition.toKey === "dismissed"
    );
    assert.ok(
      dismiss?.gates.some((gate) => gate.gateType === "dismissal_justification_set")
    );
    assert.ok(reconciled.types.some((type) => type.key === "reminder"));
  });

  it("preserves a user-renamed display label and extra edge", () => {
    const custom = createDefaultAlertLifecycleConfig();
    custom.statuses.find((status) => status.key === "pending")!.label = "Raised";
    custom.transitions.push({
      fromKey: "pending",
      toKey: "actioned",
      enabled: true,
      enforcement: "flexible",
      isSystem: false,
      sortOrder: 99,
      gates: [],
    });

    const reconciled = reconcileAlertLifecycleSpec(custom);

    assert.equal(
      reconciled.statuses.find((status) => status.key === "pending")?.label,
      "Raised"
    );
    assert.ok(
      reconciled.transitions.some(
        (transition) =>
          transition.fromKey === "pending" && transition.toKey === "actioned"
      )
    );
  });
});
