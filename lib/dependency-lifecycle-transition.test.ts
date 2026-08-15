import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultDependencyLifecycleConfig,
  validateDependencyLifecycleConfig,
} from "@/lib/dependency-lifecycle-config";
import {
  dependencyStatusSatisfiesHardGate,
  legalNextDependencyStatuses,
  resolveDependencyLifecycleStatusRef,
  resolveDependencyRollbackCascade,
  validateDependencyTransition,
} from "@/lib/dependency-lifecycle-transition";
import {
  deniedDependencyEditFields,
  resolveDependencyEditMode,
} from "@/lib/dependency-lifecycle-edit-policy";

const config = createDefaultDependencyLifecycleConfig();

describe("default dependency lifecycle", () => {
  it("validates the enterprise default graph", () => {
    assert.equal(validateDependencyLifecycleConfig(config), null);
  });

  it("starts at Identified and keeps three terminals", () => {
    assert.equal(config.statuses.find((s) => s.isIntake)?.key, "identified");
    assert.deepEqual(
      config.statuses.filter((s) => s.terminal).map((s) => s.key),
      ["met", "waived", "removed"]
    );
  });
});

describe("resolveDependencyLifecycleStatusRef", () => {
  it("maps legacy Clear / Resolved aliases to Met; Blocked is first-class", () => {
    assert.equal(resolveDependencyLifecycleStatusRef(config, "Clear")?.key, "met");
    assert.equal(resolveDependencyLifecycleStatusRef(config, "Resolved")?.key, "met");
    assert.equal(
      resolveDependencyLifecycleStatusRef(config, "Blocked")?.key,
      "blocked"
    );
  });
});

describe("validateDependencyTransition", () => {
  it("allows Identified → Pending and Pending → In Progress", () => {
    assert.equal(
      validateDependencyTransition({
        config,
        fromStatus: "Identified",
        toStatus: "Pending",
        facts: { notes: null },
      }).allowed,
      true
    );
    assert.equal(
      validateDependencyTransition({
        config,
        fromStatus: "Pending",
        toStatus: "In Progress",
        facts: { notes: null },
      }).allowed,
      true
    );
  });

  it("allows In Progress → At Risk / Blocked / Met", () => {
    for (const to of ["At Risk", "Blocked", "Met"] as const) {
      const result = validateDependencyTransition({
        config,
        fromStatus: "In Progress",
        toStatus: to,
        facts: { notes: "ok" },
      });
      assert.equal(result.allowed, true, to);
    }
  });

  it("allows Blocked → In Progress / Escalated (notes) and Escalated → Met", () => {
    assert.equal(
      validateDependencyTransition({
        config,
        fromStatus: "Blocked",
        toStatus: "In Progress",
        facts: { notes: null },
      }).allowed,
      true
    );
    const escalateDenied = validateDependencyTransition({
      config,
      fromStatus: "Blocked",
      toStatus: "Escalated",
      facts: { notes: null },
    });
    assert.equal(escalateDenied.allowed, false);
    if (!escalateDenied.allowed) {
      assert.equal(escalateDenied.code, "TRANSITION_NEEDS_OVERRIDE");
    }
    assert.equal(
      validateDependencyTransition({
        config,
        fromStatus: "Blocked",
        toStatus: "Escalated",
        facts: { notes: "Need director review — vendor slip" },
      }).allowed,
      true
    );
    assert.equal(
      validateDependencyTransition({
        config,
        fromStatus: "Escalated",
        toStatus: "Met",
        facts: { notes: "Director accepted residual risk" },
      }).allowed,
      true
    );
  });

  it("requires notes or override to Waive (catalog documented_approval)", () => {
    const denied = validateDependencyTransition({
      config,
      fromStatus: "Pending",
      toStatus: "Waived",
      facts: { notes: null },
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

    const ok = validateDependencyTransition({
      config,
      fromStatus: "Pending",
      toStatus: "Waived",
      facts: { notes: "CAB approved waiver 2026-08-01" },
    });
    assert.equal(ok.allowed, true);
  });

  it("blocks exit from Met / Waived / Removed for users", () => {
    for (const from of ["Met", "Waived", "Removed"] as const) {
      const result = validateDependencyTransition({
        config,
        fromStatus: from,
        toStatus: "Pending",
        facts: { notes: "x" },
      });
      assert.equal(result.allowed, false);
    }
  });

  it("AV-26: Met → At Risk only when isSystemTransition is true (role flags)", () => {
    const userDenied = validateDependencyTransition({
      config,
      fromStatus: "Met",
      toStatus: "At Risk",
      facts: { notes: null },
    });
    assert.equal(userDenied.allowed, false);

    const systemOk = validateDependencyTransition({
      config,
      fromStatus: "Met",
      toStatus: "At Risk",
      facts: { notes: null },
      isSystemTransition: true,
    });
    assert.equal(systemOk.allowed, true);
    if (systemOk.allowed) {
      assert.equal(systemOk.toKey, "at_risk");
    }
  });

  it("does not treat Waived as an AV-26 source", () => {
    const systemDenied = validateDependencyTransition({
      config,
      fromStatus: "Waived",
      toStatus: "At Risk",
      facts: { notes: "x" },
      isSystemTransition: true,
    });
    assert.equal(systemDenied.allowed, false);
  });

  it("allows At Risk → In Progress / Met", () => {
    assert.equal(
      validateDependencyTransition({
        config,
        fromStatus: "At Risk",
        toStatus: "In Progress",
        facts: { notes: null },
      }).allowed,
      true
    );
  });
});

describe("legalNextDependencyStatuses", () => {
  it("lists sheet next steps from Identified and hides terminals", () => {
    const fromIdentified = legalNextDependencyStatuses(config, "Identified").map(
      (s) => s.label
    );
    assert.ok(fromIdentified.includes("Pending"));
    assert.ok(!fromIdentified.includes("In Progress"));
    assert.deepEqual(legalNextDependencyStatuses(config, "Met"), []);
  });
});

describe("resolveDependencyRollbackCascade", () => {
  it("reads live roles, not hardcoded Met / At Risk keys", () => {
    const plan = resolveDependencyRollbackCascade(config);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.dest.key, "at_risk");
    assert.ok(plan.sourceValues.includes("Met"));
    assert.ok(plan.sourceValues.includes("met"));
  });

  it("faults when the rollback-warning dest role is missing", () => {
    const broken = createDefaultDependencyLifecycleConfig();
    broken.statuses = broken.statuses.map((s) => ({
      ...s,
      rollbackWarningTarget: false,
    }));
    const plan = resolveDependencyRollbackCascade(broken);
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.fault.roleId, "rollbackWarningTarget");
  });
});

describe("dependencyStatusSatisfiesHardGate", () => {
  it("treats Met / Waived / Clear as clearing Hard deps", () => {
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Met"), true);
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Waived"), true);
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Clear"), true);
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Pending"), false);
    assert.equal(dependencyStatusSatisfiesHardGate(config, "At Risk"), false);
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Blocked"), false);
  });
});

describe("dependency edit policy", () => {
  it("marks Met read_only and Waived/Removed immutable", () => {
    assert.equal(resolveDependencyEditMode(config, "Met"), "read_only");
    assert.equal(resolveDependencyEditMode(config, "Waived"), "immutable");
    assert.equal(resolveDependencyEditMode(config, "Removed"), "immutable");
    assert.equal(resolveDependencyEditMode(config, "Identified"), "full");
    assert.equal(resolveDependencyEditMode(config, "Pending"), "full");
  });

  it("denies type edits on Met", () => {
    const { denied } = deniedDependencyEditFields(config, "Met", [
      "dependencyType",
      "notes",
      "status",
    ]);
    assert.deepEqual(denied, ["dependencyType"]);
  });
});
