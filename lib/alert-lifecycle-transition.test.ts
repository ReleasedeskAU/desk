import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultAlertLifecycleConfig,
  validateAlertLifecycleConfig,
} from "@/lib/alert-lifecycle-config";
import {
  resolveAlertLifecycleStatusRef,
  validateAlertTransition,
} from "@/lib/alert-lifecycle-transition";
import {
  deniedAlertEditFields,
  resolveAlertEditMode,
} from "@/lib/alert-lifecycle-edit-policy";

const config = createDefaultAlertLifecycleConfig();

describe("default alert lifecycle", () => {
  it("validates the enterprise default graph and types", () => {
    assert.equal(validateAlertLifecycleConfig(config), null);
    assert.ok(config.types.some((t) => t.key === "reminder"));
    assert.ok(config.types.some((t) => t.key === "warning"));
    assert.ok(config.types.some((t) => t.key === "escalation"));
    assert.ok(config.types.some((t) => t.key === "notification"));
  });
});

describe("resolveAlertLifecycleStatusRef", () => {
  it("maps legacy Active / Open / Resolved / Closed aliases", () => {
    assert.equal(resolveAlertLifecycleStatusRef(config, "Active")?.key, "pending");
    assert.equal(resolveAlertLifecycleStatusRef(config, "Open")?.key, "pending");
    assert.equal(
      resolveAlertLifecycleStatusRef(config, "Investigating")?.key,
      "acknowledged"
    );
    assert.equal(resolveAlertLifecycleStatusRef(config, "Resolved")?.key, "actioned");
    assert.equal(resolveAlertLifecycleStatusRef(config, "Closed")?.key, "actioned");
  });
});

describe("validateAlertTransition", () => {
  it("allows Pending → Acknowledged / Expired", () => {
    for (const to of ["Acknowledged", "Expired"] as const) {
      const result = validateAlertTransition({
        config,
        fromStatus: "Pending",
        toStatus: to,
      });
      assert.equal(result.allowed, true);
    }
  });

  it("requires reason to Dismiss", () => {
    const denied = validateAlertTransition({
      config,
      fromStatus: "Pending",
      toStatus: "Dismissed",
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

    const ok = validateAlertTransition({
      config,
      fromStatus: "Acknowledged",
      toStatus: "Dismissed",
      overrideReason: "False positive — metric noise",
    });
    assert.equal(ok.allowed, true);
  });

  it("allows Acknowledged → Actioned", () => {
    const result = validateAlertTransition({
      config,
      fromStatus: "Acknowledged",
      toStatus: "Actioned",
    });
    assert.equal(result.allowed, true);
  });

  it("blocks exit from Actioned / Dismissed / Expired", () => {
    for (const from of ["Actioned", "Dismissed", "Expired"] as const) {
      const result = validateAlertTransition({
        config,
        fromStatus: from,
        toStatus: "Pending",
      });
      assert.equal(result.allowed, false);
    }
  });

  it("blocks Pending → Actioned (not in graph)", () => {
    const result = validateAlertTransition({
      config,
      fromStatus: "Pending",
      toStatus: "Actioned",
    });
    assert.equal(result.allowed, false);
  });
});

describe("alert edit policy", () => {
  it("marks Actioned / Dismissed / Expired immutable and Acknowledged limited", () => {
    assert.equal(resolveAlertEditMode(config, "Actioned"), "immutable");
    assert.equal(resolveAlertEditMode(config, "Dismissed"), "immutable");
    assert.equal(resolveAlertEditMode(config, "Expired"), "immutable");
    assert.equal(resolveAlertEditMode(config, "Acknowledged"), "limited");
    assert.equal(resolveAlertEditMode(config, "Active"), "full");
  });

  it("denies severity edits on Acknowledged and Actioned", () => {
    const limited = deniedAlertEditFields(config, "Acknowledged", [
      "severity",
      "status",
      "assignedTo",
    ]);
    assert.deepEqual(limited.denied, ["severity"]);

    const terminal = deniedAlertEditFields(config, "Actioned", [
      "severity",
      "status",
    ]);
    assert.deepEqual(terminal.denied, ["severity"]);
  });
});
