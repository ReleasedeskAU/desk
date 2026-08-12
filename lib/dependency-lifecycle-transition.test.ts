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
  it("validates the enterprise default graph", () => {
    assert.equal(validateDependencyLifecycleConfig(config), null);
  });
});

describe("resolveDependencyLifecycleStatusRef", () => {
  it("maps legacy Clear / Resolved / Blocked aliases", () => {
    assert.equal(resolveDependencyLifecycleStatusRef(config, "Clear")?.key, "met");
    assert.equal(resolveDependencyLifecycleStatusRef(config, "Resolved")?.key, "met");
    assert.equal(resolveDependencyLifecycleStatusRef(config, "Blocked")?.key, "at_risk");
  });
});

describe("validateDependencyTransition", () => {
  it("allows Pending → Met / At Risk / Removed", () => {
    for (const to of ["Met", "At Risk", "Removed"] as const) {
      const result = validateDependencyTransition({
        config,
        fromStatus: "Pending",
        toStatus: to,
        facts: { notes: "ok" },
      });
      assert.equal(result.allowed, true);
    }
  });

  it("requires notes or override to Waive", () => {
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

  it("blocks exit from Met / Waived / Removed", () => {
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

  it("AV-26: Met → At Risk only when isSystemTransition is true", () => {
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

  it("allows At Risk → Pending / Met", () => {
    assert.equal(
      validateDependencyTransition({
        config,
        fromStatus: "At Risk",
        toStatus: "Pending",
        facts: { notes: null },
      }).allowed,
      true
    );
  });
});

describe("dependencyStatusSatisfiesHardGate", () => {
  it("treats Met / Waived / Clear as clearing Hard deps", () => {
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Met"), true);
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Waived"), true);
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Clear"), true);
    assert.equal(dependencyStatusSatisfiesHardGate(config, "Pending"), false);
    assert.equal(dependencyStatusSatisfiesHardGate(config, "At Risk"), false);
  });
});

describe("dependency edit policy", () => {
  it("marks Met read_only and Waived/Removed immutable", () => {
    assert.equal(resolveDependencyEditMode(config, "Met"), "read_only");
    assert.equal(resolveDependencyEditMode(config, "Waived"), "immutable");
    assert.equal(resolveDependencyEditMode(config, "Removed"), "immutable");
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
