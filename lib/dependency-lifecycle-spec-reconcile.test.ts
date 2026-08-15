/**
 * Run: npx tsx --test lib/dependency-lifecycle-spec-reconcile.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultDependencyLifecycleConfig } from "@/lib/dependency-lifecycle-config";
import { reconcileDependencyLifecycleSpec } from "@/lib/dependency-lifecycle-spec-reconcile";

describe("reconcileDependencyLifecycleSpec", () => {
  it("adds Identified / In Progress / Blocked / Escalated to a legacy 5-status graph", () => {
    const legacy = createDefaultDependencyLifecycleConfig();
    legacy.statuses = legacy.statuses.filter((s) =>
      ["pending", "at_risk", "met", "waived", "removed"].includes(s.key)
    );
    const pending = legacy.statuses.find((s) => s.key === "pending");
    if (pending) pending.isIntake = true;
    legacy.transitions = legacy.transitions.filter(
      (t) =>
        ["pending", "at_risk", "met", "waived", "removed"].includes(t.fromKey) &&
        ["pending", "at_risk", "met", "waived", "removed"].includes(t.toKey)
    );

    const reconciled = reconcileDependencyLifecycleSpec(legacy);
    const keys = reconciled.statuses.map((s) => s.key);
    assert.ok(keys.includes("identified"));
    assert.ok(keys.includes("in_progress"));
    assert.ok(keys.includes("blocked"));
    assert.ok(keys.includes("escalated"));
    assert.equal(reconciled.statuses.find((s) => s.key === "identified")?.isIntake, true);
    assert.equal(reconciled.statuses.find((s) => s.key === "pending")?.isIntake, false);
    assert.ok(
      reconciled.transitions.some(
        (t) => t.fromKey === "identified" && t.toKey === "pending"
      )
    );
    assert.ok(
      reconciled.transitions.some(
        (t) =>
          t.toKey === "waived" &&
          t.gates.some((g) => g.gateType === "documented_approval")
      )
    );
  });

  it("does not steal a custom Starting status", () => {
    const custom = createDefaultDependencyLifecycleConfig();
    custom.statuses = custom.statuses.filter((s) =>
      ["pending", "at_risk", "met", "waived", "removed"].includes(s.key)
    );
    custom.statuses = custom.statuses.map((s) => ({
      ...s,
      isIntake: s.key === "at_risk",
    }));
    custom.transitions = [];

    const reconciled = reconcileDependencyLifecycleSpec(custom);
    assert.equal(reconciled.statuses.find((s) => s.key === "at_risk")?.isIntake, true);
    assert.equal(
      reconciled.statuses.find((s) => s.key === "identified")?.isIntake,
      false
    );
  });
});
