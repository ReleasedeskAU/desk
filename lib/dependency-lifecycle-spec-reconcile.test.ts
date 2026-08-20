import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultDependencyLifecycleConfig } from "@/lib/dependency-lifecycle-config";
import { reconcileDependencyLifecycleSpec } from "@/lib/dependency-lifecycle-spec-reconcile";

describe("reconcileDependencyLifecycleSpec", () => {
  it("rebuilds a Met/Waived snapshot onto the 10-status sheet", () => {
    const stored = createDefaultDependencyLifecycleConfig();
    stored.statuses = [
      {
        key: "pending",
        label: "Pending",
        sortOrder: 10,
        terminal: false,
        enabled: true,
        isSystem: true,
        editMode: "full",
        cascadeEffect: "",
        satisfiesHardGate: false,
        isIntake: true,
        autoResolvedOnDeploy: false,
        rollbackReopensAtRisk: false,
        atRiskWarning: false,
      },
      {
        key: "met",
        label: "Met",
        sortOrder: 20,
        terminal: true,
        enabled: true,
        isSystem: true,
        editMode: "read_only",
        cascadeEffect: "",
        satisfiesHardGate: true,
        isIntake: false,
        autoResolvedOnDeploy: true,
        rollbackReopensAtRisk: true,
        atRiskWarning: false,
      },
      {
        key: "waived",
        label: "Waived",
        sortOrder: 30,
        terminal: true,
        enabled: false,
        isSystem: true,
        editMode: "immutable",
        cascadeEffect: "",
        satisfiesHardGate: true,
        isIntake: false,
        autoResolvedOnDeploy: false,
        rollbackReopensAtRisk: false,
        atRiskWarning: false,
      },
    ];
    stored.transitions = [
      {
        fromKey: "pending",
        toKey: "met",
        enabled: false,
        enforcement: "flexible",
        isSystem: true,
        sortOrder: 10,
        gates: [],
      },
      {
        fromKey: "pending",
        toKey: "waived",
        enabled: true,
        enforcement: "required",
        isSystem: true,
        sortOrder: 20,
        gates: [],
      },
    ];

    const next = reconcileDependencyLifecycleSpec(stored);
    assert.equal(next.statuses.length, 10);
    assert.equal(next.statuses.find((s) => s.key === "met"), undefined);
    assert.equal(next.statuses.find((s) => s.key === "waived"), undefined);
    assert.equal(next.statuses.find((s) => s.key === "resolved")?.label, "Resolved");
    assert.equal(next.statuses.find((s) => s.key === "removed")?.enabled, false);
    assert.equal(next.statuses.find((s) => s.key === "identified")?.isIntake, true);
    assert.equal(next.statuses.find((s) => s.key === "closed")?.terminal, true);

    const pendingRemoved = next.transitions.find(
      (t) => t.fromKey === "pending" && t.toKey === "removed"
    );
    assert.equal(pendingRemoved?.enforcement, "required");
    assert.ok(pendingRemoved?.gates.some((g) => g.gateType === "notes_documented"));
  });

  it("keeps stored enabled flags on sheet edges", () => {
    const stored = createDefaultDependencyLifecycleConfig();
    stored.transitions = stored.transitions.map((t) =>
      t.fromKey === "identified" && t.toKey === "pending"
        ? { ...t, enabled: false }
        : t
    );
    const next = reconcileDependencyLifecycleSpec(stored);
    const edge = next.transitions.find(
      (t) => t.fromKey === "identified" && t.toKey === "pending"
    );
    assert.equal(edge?.enabled, false);
  });
});
