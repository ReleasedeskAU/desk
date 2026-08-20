import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultAlertLifecycleConfig,
  validateAlertLifecycleConfig,
} from "@/lib/alert-lifecycle-config";
import {
  legalNextAlertStatuses,
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
  it("maps legacy Pending / Actioned / Dismissed / Expired onto the 7-status sheet", () => {
    assert.equal(resolveAlertLifecycleStatusRef(config, "Active")?.key, "active");
    assert.equal(resolveAlertLifecycleStatusRef(config, "Pending")?.key, "active");
    assert.equal(resolveAlertLifecycleStatusRef(config, "Open")?.key, "active");
    assert.equal(
      resolveAlertLifecycleStatusRef(config, "Investigating")?.key,
      "investigating"
    );
    assert.equal(resolveAlertLifecycleStatusRef(config, "Actioned")?.key, "resolved");
    assert.equal(resolveAlertLifecycleStatusRef(config, "Resolved")?.key, "resolved");
    assert.equal(resolveAlertLifecycleStatusRef(config, "Dismissed")?.key, "closed");
    assert.equal(resolveAlertLifecycleStatusRef(config, "Expired")?.key, "closed");
    assert.equal(resolveAlertLifecycleStatusRef(config, "Closed")?.key, "closed");
  });
});

describe("validateAlertTransition", () => {
  it("allows Active → Acknowledged / Suppressed", () => {
    for (const to of ["Acknowledged", "Suppressed"] as const) {
      const result = validateAlertTransition({
        config,
        fromStatus: "Active",
        toStatus: to,
      });
      assert.equal(result.allowed, true);
    }
  });

  it("allows Acknowledged → Resolved via the Actioned alias", () => {
    const result = validateAlertTransition({
      config,
      fromStatus: "Acknowledged",
      toStatus: "Actioned",
    });
    assert.equal(result.allowed, true);
  });

  it("blocks exit from Closed (including Dismissed / Expired aliases)", () => {
    for (const from of ["Closed", "Dismissed", "Expired"] as const) {
      const result = validateAlertTransition({
        config,
        fromStatus: from,
        toStatus: "Active",
      });
      assert.equal(result.allowed, false);
    }
  });

  it("blocks Active → Resolved (not a default edge)", () => {
    const result = validateAlertTransition({
      config,
      fromStatus: "Active",
      toStatus: "Resolved",
    });
    assert.equal(result.allowed, false);
  });

  it("lists legal next statuses from Active", () => {
    const next = legalNextAlertStatuses(config, "Active").map((s) => s.key);
    assert.deepEqual(next, ["acknowledged", "suppressed"]);
  });
});

describe("alert edit policy", () => {
  it("marks Closed immutable, Resolved/Acknowledged limited, Active full", () => {
    assert.equal(resolveAlertEditMode(config, "Closed"), "immutable");
    assert.equal(resolveAlertEditMode(config, "Dismissed"), "immutable");
    assert.equal(resolveAlertEditMode(config, "Expired"), "immutable");
    assert.equal(resolveAlertEditMode(config, "Resolved"), "limited");
    assert.equal(resolveAlertEditMode(config, "Actioned"), "limited");
    assert.equal(resolveAlertEditMode(config, "Acknowledged"), "limited");
    assert.equal(resolveAlertEditMode(config, "Active"), "full");
  });

  it("denies severity edits on Acknowledged and Resolved", () => {
    const limited = deniedAlertEditFields(config, "Acknowledged", [
      "severity",
      "status",
      "assignedTo",
    ]);
    assert.deepEqual(limited.denied, ["severity"]);

    const terminal = deniedAlertEditFields(config, "Resolved", [
      "severity",
      "status",
    ]);
    assert.deepEqual(terminal.denied, ["severity"]);
  });
});
