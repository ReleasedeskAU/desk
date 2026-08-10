import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultConflictLifecycleConfig,
  validateConflictLifecycleConfig,
} from "@/lib/conflict-lifecycle-config";
import {
  resolveConflictLifecycleStatusRef,
  validateConflictTransition,
} from "@/lib/conflict-lifecycle-transition";
import {
  deniedConflictEditFields,
  resolveConflictEditMode,
} from "@/lib/conflict-lifecycle-edit-policy";

const config = createDefaultConflictLifecycleConfig();

describe("default conflict lifecycle", () => {
  it("validates the enterprise default graph and types", () => {
    assert.equal(validateConflictLifecycleConfig(config), null);
    assert.ok(config.types.some((t) => t.key === "schedule"));
    assert.ok(config.types.some((t) => t.key === "resource"));
    assert.ok(config.types.some((t) => t.key === "application"));
  });
});

describe("resolveConflictLifecycleStatusRef", () => {
  it("maps legacy Open / In Progress / Escalated aliases", () => {
    assert.equal(resolveConflictLifecycleStatusRef(config, "Open")?.key, "detected");
    assert.equal(
      resolveConflictLifecycleStatusRef(config, "In Progress")?.key,
      "under_review"
    );
    assert.equal(
      resolveConflictLifecycleStatusRef(config, "Escalated")?.key,
      "under_review"
    );
  });
});

describe("validateConflictTransition", () => {
  it("allows Detected → Under Review / Resolved", () => {
    for (const to of ["Under Review", "Resolved"] as const) {
      const result = validateConflictTransition({
        config,
        fromStatus: "Detected",
        toStatus: to,
        facts: { notes: "ok" },
      });
      assert.equal(result.allowed, true);
    }
  });

  it("requires notes or override to Dismiss", () => {
    const denied = validateConflictTransition({
      config,
      fromStatus: "Detected",
      toStatus: "Dismissed",
      facts: { notes: null },
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

    const ok = validateConflictTransition({
      config,
      fromStatus: "Under Review",
      toStatus: "Dismissed",
      facts: { notes: "False positive — different env region" },
    });
    assert.equal(ok.allowed, true);
  });

  it("blocks exit from Resolved / Dismissed", () => {
    for (const from of ["Resolved", "Dismissed"] as const) {
      const result = validateConflictTransition({
        config,
        fromStatus: from,
        toStatus: "Detected",
        facts: { notes: "x" },
      });
      assert.equal(result.allowed, false);
    }
  });
});

describe("conflict edit policy", () => {
  it("marks Resolved / Dismissed immutable", () => {
    assert.equal(resolveConflictEditMode(config, "Resolved"), "immutable");
    assert.equal(resolveConflictEditMode(config, "Dismissed"), "immutable");
    assert.equal(resolveConflictEditMode(config, "Open"), "full");
  });

  it("denies priority edits on Resolved", () => {
    const { denied } = deniedConflictEditFields(config, "Resolved", [
      "priority",
      "status",
    ]);
    assert.deepEqual(denied, ["priority"]);
  });
});
