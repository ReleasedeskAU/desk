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
      },
      {
        fromKey: "pending",
        toKey: "dismissed",
        enabled: true,
        enforcement: "flexible",
        isSystem: true,
        sortOrder: 20,
      },
      {
        fromKey: "acknowledged",
        toKey: "actioned",
        enabled: true,
        enforcement: "flexible",
        isSystem: true,
        sortOrder: 10,
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
  it("remaps Pending/Actioned/Dismissed/Expired onto the 7-status sheet", () => {
    const reconciled = reconcileAlertLifecycleSpec(legacyFiveStatusGraph());

    assert.equal(reconciled.statuses.length, 7);
    assert.equal(
      reconciled.statuses.find((status) => status.key === "active")?.label,
      "Active"
    );
    assert.equal(
      reconciled.statuses.find((status) => status.key === "resolved")?.label,
      "Resolved"
    );
    assert.ok(!reconciled.statuses.some((status) => status.key === "pending"));
    assert.ok(!reconciled.statuses.some((status) => status.key === "actioned"));
    assert.ok(!reconciled.statuses.some((status) => status.key === "dismissed"));
    assert.ok(!reconciled.statuses.some((status) => status.key === "expired"));
    assert.ok(reconciled.statuses.some((status) => status.key === "investigating"));
    assert.ok(reconciled.statuses.some((status) => status.key === "escalated"));
    assert.ok(reconciled.statuses.some((status) => status.key === "closed"));
    assert.ok(
      reconciled.transitions.some(
        (transition) =>
          transition.fromKey === "active" && transition.toKey === "acknowledged"
      )
    );
    assert.ok(reconciled.types.some((type) => type.key === "warning"));
    assert.ok(!reconciled.types.some((type) => type.key === "reminder"));
  });

  it("preserves a user-renamed Active label", () => {
    const custom = createDefaultAlertLifecycleConfig();
    custom.statuses.find((status) => status.key === "active")!.label = "Raised";

    const reconciled = reconcileAlertLifecycleSpec(custom);

    assert.equal(
      reconciled.statuses.find((status) => status.key === "active")?.label,
      "Raised"
    );
  });
});
