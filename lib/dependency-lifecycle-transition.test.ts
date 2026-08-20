import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultDependencyLifecycleConfig,
  validateDependencyLifecycleConfig,
} from "@/lib/dependency-lifecycle-config";
import {
  dependencyStatusSatisfiesHardGate,
  resolveDependencyLifecycleStatusRef,
  validateDependencyTransition,
} from "@/lib/dependency-lifecycle-transition";
import {
  deniedDependencyEditFields,
  resolveDependencyEditMode,
} from "@/lib/dependency-lifecycle-edit-policy";

const config = createDefaultDependencyLifecycleConfig();

describe("default dependency lifecycle", () => {
  it("validates the enterprise 10-status sheet graph", () => {
    assert.equal(validateDependencyLifecycleConfig(config), null);
    assert.equal(config.statuses.length, 10);
    assert.equal(config.statuses.filter((s) => s.terminal).length, 1);
    assert.equal(config.statuses.find((s) => s.terminal)?.key, "closed");
    assert.equal(config.statuses.find((s) => s.isIntake)?.key, "identified");
  });
});

describe("resolveDependencyLifecycleStatusRef", () => {
  it("maps Clear / Met to Resolved and Waived to Removed", () => {
    assert.equal(resolveDependencyLifecycleStatusRef(config, "Clear")?.key, "resolved");
    assert.equal(resolveDependencyLifecycleStatusRef(config, "Met")?.key, "resolved");
    assert.equal(resolveDependencyLifecycleStatusRef(config, "Waived")?.key, "removed");
    assert.equal(resolveDependencyLifecycleStatusRef(config, "at risk")?.key, "at_risk");
    assert.equal(resolveDependencyLifecycleStatusRef(config, "in progress")?.key, "in_progress");
  });

  it("does not alias first-class resolved / blocked keys", () => {
    assert.equal(resolveDependencyLifecycleStatusRef(config, "resolved")?.key, "resolved");
    assert.equal(resolveDependencyLifecycleStatusRef(config, "Resolved")?.key, "resolved");
    assert.equal(resolveDependencyLifecycleStatusRef(config, "blocked")?.key, "blocked");
    assert.equal(resolveDependencyLifecycleStatusRef(config, "Blocked")?.key, "blocked");
  });
});

describe("validateDependencyTransition", () => {
  it("walks Identified → Pending → Confirmed", () => {
    for (const [from, to] of [
      ["Identified", "Pending"],
      ["Identified", "Confirmed"],
      ["Pending", "Confirmed"],
    ] as const) {
      const result = validateDependencyTransition({
        config,
        fromStatus: from,
        toStatus: to,
        facts: { notes: null },
      });
      assert.equal(result.allowed, true, `${from} → ${to}`);
    }
  });

  it("blocks Identified → Resolved (AV-04 only lands when the edge is legal)", () => {
    const result = validateDependencyTransition({
      config,
      fromStatus: "Identified",
      toStatus: "Resolved",
      facts: { notes: null },
    });
    assert.equal(result.allowed, false);
    if (!result.allowed) assert.equal(result.code, "ILLEGAL_TRANSITION");
  });

  it("requires both acknowledgments or an override for Confirmed → In Progress", () => {
    const denied = validateDependencyTransition({
      config,
      fromStatus: "Confirmed",
      toStatus: "In Progress",
      facts: { notes: null },
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

    const ok = validateDependencyTransition({
      config,
      fromStatus: "Confirmed",
      toStatus: "In Progress",
      facts: {
        notes: null,
        sourceAcknowledgedAt: new Date(),
        sourceAcknowledgedByUserId: "src",
        targetAcknowledgedAt: new Date(),
        targetAcknowledgedByUserId: "tgt",
      },
    });
    assert.equal(ok.allowed, true);

    const overridden = validateDependencyTransition({
      config,
      fromStatus: "Confirmed",
      toStatus: "In Progress",
      overrideReason: "Both managers confirmed offline",
      facts: { notes: null },
    });
    assert.equal(overridden.allowed, true);
  });

  it("requires notes or override to Removed", () => {
    const denied = validateDependencyTransition({
      config,
      fromStatus: "Pending",
      toStatus: "Removed",
      facts: { notes: null },
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

    const ok = validateDependencyTransition({
      config,
      fromStatus: "Pending",
      toStatus: "Removed",
      facts: { notes: "CAB approved removal 2026-08-01" },
    });
    assert.equal(ok.allowed, true);
  });

  it("allows In Progress → At Risk / Blocked / Resolved", () => {
    for (const to of ["At Risk", "Blocked", "Resolved"] as const) {
      const result = validateDependencyTransition({
        config,
        fromStatus: "In Progress",
        toStatus: to,
        facts: { notes: "ok" },
      });
      assert.equal(result.allowed, true, `In Progress → ${to}`);
    }
  });

  it("allows Resolved / Removed → Closed and blocks Closed exits", () => {
    assert.equal(
      validateDependencyTransition({
        config,
        fromStatus: "Resolved",
        toStatus: "Closed",
        facts: { notes: null },
      }).allowed,
      true
    );
    assert.equal(
      validateDependencyTransition({
        config,
        fromStatus: "Removed",
        toStatus: "Closed",
        facts: { notes: null },
      }).allowed,
      true
    );
    const closed = validateDependencyTransition({
      config,
      fromStatus: "Closed",
      toStatus: "Resolved",
      facts: { notes: null },
    });
    assert.equal(closed.allowed, false);
  });

  it("AV-26: Resolved → At Risk only when isSystemTransition is true", () => {
    const userDenied = validateDependencyTransition({
      config,
      fromStatus: "Resolved",
      toStatus: "At Risk",
      facts: { notes: null },
    });
    assert.equal(userDenied.allowed, false);

    const aliasDenied = validateDependencyTransition({
      config,
      fromStatus: "Met",
      toStatus: "At Risk",
      facts: { notes: null },
    });
    assert.equal(aliasDenied.allowed, false);

    const systemOk = validateDependencyTransition({
      config,
      fromStatus: "Resolved",
      toStatus: "At Risk",
      facts: { notes: null },
      isSystemTransition: true,
    });
    assert.equal(systemOk.allowed, true);
    if (systemOk.allowed) {
      assert.equal(systemOk.toKey, "at_risk");
    }
  });
});

describe("dependencyStatusSatisfiesHardGate (VR-18)", () => {
  it("is false until Resolved / Removed / Closed", () => {
    for (const status of [
      "Identified",
      "Pending",
      "Confirmed",
      "In Progress",
      "At Risk",
      "Blocked",
      "Escalated",
    ]) {
      assert.equal(
        dependencyStatusSatisfiesHardGate(config, status),
        false,
        status
      );
    }
  });

  it("treats Resolved, Removed, Closed and legacy aliases as handled", () => {
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Resolved"), true);
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Removed"), true);
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Closed"), true);
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Clear"), true);
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Met"), true);
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Waived"), true);
  });
});

describe("dependency edit policy", () => {
  it("marks Resolved/Removed limited and Closed immutable", () => {
    assert.equal(resolveDependencyEditMode(config, "Resolved"), "limited");
    assert.equal(resolveDependencyEditMode(config, "Removed"), "limited");
    assert.equal(resolveDependencyEditMode(config, "Closed"), "immutable");
    assert.equal(resolveDependencyEditMode(config, "Identified"), "full");
    assert.equal(resolveDependencyEditMode(config, "Met"), "limited");
    assert.equal(resolveDependencyEditMode(config, "Waived"), "limited");
  });

  it("denies type edits on Resolved", () => {
    const { denied } = deniedDependencyEditFields(config, "Resolved", [
      "dependencyType",
      "notes",
      "status",
      "acknowledgeSide",
    ]);
    assert.deepEqual(denied, ["dependencyType"]);
  });
});
