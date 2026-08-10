import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import { reconcileLifecycleSpecDefaults } from "@/lib/release-lifecycle-spec-reconcile";

describe("reconcileLifecycleSpecDefaults", () => {
  it("adds missing extras and upgrades CFG-06 Required on older graphs", () => {
    const stale = createDefaultReleaseLifecycleConfig();
    stale.transitions = stale.transitions.filter(
      (t) =>
        !(t.fromKey === "testing" && t.toKey === "planning") &&
        !(t.fromKey === "rolled_back" && t.toKey === "cancelled")
    );
    for (const t of stale.transitions) {
      if (t.fromKey === "deploying" || t.fromKey === "deployed") {
        t.enforcement = "flexible";
      }
    }

    const next = reconcileLifecycleSpecDefaults(stale);
    assert.ok(
      next.transitions.some((t) => t.fromKey === "testing" && t.toKey === "planning")
    );
    assert.ok(
      next.transitions.some(
        (t) => t.fromKey === "rolled_back" && t.toKey === "cancelled"
      )
    );
    assert.equal(
      next.transitions.find((t) => t.fromKey === "deploying" && t.toKey === "deployed")
        ?.enforcement,
      "required"
    );
  });
});
