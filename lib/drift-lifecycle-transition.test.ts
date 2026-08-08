import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultDriftLifecycleConfig,
  validateDriftLifecycleConfig,
} from "@/lib/drift-lifecycle-config";
import {
  resolveDriftLifecycleStatusRef,
  validateDriftTransition,
} from "@/lib/drift-lifecycle-transition";
import {
  deniedDriftEditFields,
  resolveDriftEditMode,
} from "@/lib/drift-lifecycle-edit-policy";

const config = createDefaultDriftLifecycleConfig();

describe("default drift lifecycle", () => {
  it("validates the enterprise default graph", () => {
    assert.equal(validateDriftLifecycleConfig(config), null);
    assert.ok(config.statuses.some((s) => s.key === "detected"));
    assert.ok(config.statuses.some((s) => s.key === "escalated"));
  });
});

describe("resolveDriftLifecycleStatusRef", () => {
  it("maps legacy Open / In Progress / Resolved / Closed aliases", () => {
    assert.equal(resolveDriftLifecycleStatusRef(config, "Open")?.key, "detected");
    assert.equal(
      resolveDriftLifecycleStatusRef(config, "In Progress")?.key,
      "investigating"
    );
    assert.equal(resolveDriftLifecycleStatusRef(config, "Resolved")?.key, "approved");
    assert.equal(resolveDriftLifecycleStatusRef(config, "Closed")?.key, "reverted");
  });
});

describe("validateDriftTransition", () => {
  it("allows Detected → Investigating / Approved / Reverted", () => {
    for (const to of ["Investigating", "Approved", "Reverted"] as const) {
      const result = validateDriftTransition({
        config,
        fromStatus: "Detected",
        toStatus: to,
      });
      assert.equal(result.allowed, true);
    }
  });

  it("allows Investigating → Escalated and Escalated → Investigating", () => {
    const up = validateDriftTransition({
      config,
      fromStatus: "Investigating",
      toStatus: "Escalated",
    });
    assert.equal(up.allowed, true);

    const down = validateDriftTransition({
      config,
      fromStatus: "Escalated",
      toStatus: "Investigating",
    });
    assert.equal(down.allowed, true);
  });

  it("blocks exit from Approved / Reverted", () => {
    for (const from of ["Approved", "Reverted"] as const) {
      const result = validateDriftTransition({
        config,
        fromStatus: from,
        toStatus: "Investigating",
      });
      assert.equal(result.allowed, false);
    }
  });

  it("blocks Detected → Escalated (not in graph)", () => {
    const result = validateDriftTransition({
      config,
      fromStatus: "Detected",
      toStatus: "Escalated",
    });
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.code, "ILLEGAL_TRANSITION");
  });
});

describe("drift edit policy", () => {
  it("marks Approved / Reverted immutable", () => {
    assert.equal(resolveDriftEditMode(config, "Approved"), "immutable");
    assert.equal(resolveDriftEditMode(config, "Reverted"), "immutable");
    assert.equal(resolveDriftEditMode(config, "Open"), "full");
  });

  it("denies severity edits on Approved", () => {
    const { denied } = deniedDriftEditFields(config, "Approved", [
      "severity",
      "status",
    ]);
    assert.deepEqual(denied, ["severity"]);
  });
});
