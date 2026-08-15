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
import { enabledStatusMatchValues } from "@/lib/lifecycle-status-roles";

const config = createDefaultAlertLifecycleConfig();

describe("default alert lifecycle", () => {
  it("validates the 8-status enterprise graph and urgency types", () => {
    assert.equal(validateAlertLifecycleConfig(config), null);
    const labels = config.statuses.map((status) => status.label);
    assert.deepEqual(labels, [
      "Active",
      "Acknowledged",
      "Investigating",
      "Escalated",
      "Resolved",
      "Closed",
      "Dismissed",
      "Expired",
    ]);
    assert.ok(config.types.some((t) => t.key === "reminder"));
    assert.ok(config.types.some((t) => t.key === "warning"));
    assert.ok(config.types.some((t) => t.key === "escalation"));
    assert.ok(config.types.some((t) => t.key === "notification"));
  });

  it("gives Active a unique Required expiry exit", () => {
    const intake = config.statuses.find((status) => status.isIntake);
    assert.ok(intake);
    const required = config.transitions.filter(
      (transition) =>
        transition.enabled &&
        transition.fromKey === intake.key &&
        transition.enforcement === "required"
    );
    assert.equal(required.length, 1);
    const dest = config.statuses.find((status) => status.key === required[0]!.toKey);
    assert.equal(dest?.terminal, true);
    assert.equal(dest?.label, "Expired");
    assert.equal(intake.expiryDays, 7);
  });

  it("marks Resolved working and Closed / Dismissed / Expired terminal", () => {
    const resolved = config.statuses.find((status) => status.label === "Resolved");
    const closed = config.statuses.find((status) => status.label === "Closed");
    assert.equal(resolved?.terminal, false);
    assert.equal(resolved?.editMode, "limited");
    assert.equal(closed?.terminal, true);
    assert.equal(closed?.editMode, "immutable");
    for (const label of ["Dismissed", "Expired"] as const) {
      const status = config.statuses.find((item) => item.label === label);
      assert.equal(status?.terminal, true);
      assert.equal(status?.editMode, "immutable");
    }
  });
});

describe("resolveAlertLifecycleStatusRef", () => {
  it("resolves leftover Pending / Actioned / Open after real labels", () => {
    assert.equal(resolveAlertLifecycleStatusRef(config, "Active")?.key, "pending");
    assert.equal(resolveAlertLifecycleStatusRef(config, "Pending")?.key, "pending");
    assert.equal(resolveAlertLifecycleStatusRef(config, "Open")?.key, "pending");
    assert.equal(resolveAlertLifecycleStatusRef(config, "Actioned")?.key, "actioned");
    assert.equal(resolveAlertLifecycleStatusRef(config, "Resolved")?.key, "actioned");
  });

  it("does not hide new real statuses behind leftover aliases", () => {
    assert.equal(
      resolveAlertLifecycleStatusRef(config, "Investigating")?.label,
      "Investigating"
    );
    assert.equal(resolveAlertLifecycleStatusRef(config, "Closed")?.label, "Closed");
    assert.equal(resolveAlertLifecycleStatusRef(config, "Resolved")?.label, "Resolved");
    assert.notEqual(
      resolveAlertLifecycleStatusRef(config, "Investigating")?.key,
      "acknowledged"
    );
    assert.notEqual(resolveAlertLifecycleStatusRef(config, "Closed")?.key, "actioned");
  });
});

describe("validateAlertTransition", () => {
  it("allows Active → Acknowledged and leftover Pending → Acknowledged", () => {
    for (const from of ["Active", "Pending"] as const) {
      const result = validateAlertTransition({
        config,
        fromStatus: from,
        toStatus: "Acknowledged",
      });
      assert.equal(result.allowed, true);
    }
  });

  it("requires notes to Dismiss, and still allows a Flexible override", () => {
    const denied = validateAlertTransition({
      config,
      fromStatus: "Active",
      toStatus: "Dismissed",
      facts: { notes: null },
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

    const withNotes = validateAlertTransition({
      config,
      fromStatus: "Acknowledged",
      toStatus: "Dismissed",
      facts: { notes: "False positive — metric noise" },
    });
    assert.equal(withNotes.allowed, true);

    const overridden = validateAlertTransition({
      config,
      fromStatus: "Active",
      toStatus: "Dismissed",
      overrideReason: "CAB agreed this is noise",
      facts: { notes: null },
    });
    assert.equal(overridden.allowed, true);
    if (overridden.allowed) assert.equal(overridden.overridden, true);
  });

  it("allows Acknowledged → Resolved via leftover Actioned label", () => {
    const result = validateAlertTransition({
      config,
      fromStatus: "Acknowledged",
      toStatus: "Actioned",
    });
    assert.equal(result.allowed, true);
    if (result.allowed) assert.equal(result.canonicalStatus, "Resolved");
  });

  it("allows Resolved → Closed and blocks exit from terminals", () => {
    const close = validateAlertTransition({
      config,
      fromStatus: "Resolved",
      toStatus: "Closed",
    });
    assert.equal(close.allowed, true);

    for (const from of ["Closed", "Dismissed", "Expired"] as const) {
      const result = validateAlertTransition({
        config,
        fromStatus: from,
        toStatus: "Active",
      });
      assert.equal(result.allowed, false);
    }
  });

  it("blocks Active → Resolved (not in graph)", () => {
    const result = validateAlertTransition({
      config,
      fromStatus: "Active",
      toStatus: "Resolved",
    });
    assert.equal(result.allowed, false);
  });
});

describe("legalNextAlertStatuses", () => {
  it("lists Acknowledged and Dismissed from Active, not cron-only Expired", () => {
    const next = legalNextAlertStatuses(config, "Active").map((item) => item.label);
    assert.deepEqual(next, ["Acknowledged", "Dismissed"]);
  });
});

describe("alert edit policy", () => {
  it("marks Resolved limited and Closed / Dismissed / Expired immutable", () => {
    assert.equal(resolveAlertEditMode(config, "Resolved"), "limited");
    assert.equal(resolveAlertEditMode(config, "Actioned"), "limited");
    assert.equal(resolveAlertEditMode(config, "Closed"), "immutable");
    assert.equal(resolveAlertEditMode(config, "Dismissed"), "immutable");
    assert.equal(resolveAlertEditMode(config, "Expired"), "immutable");
    assert.equal(resolveAlertEditMode(config, "Acknowledged"), "limited");
    assert.equal(resolveAlertEditMode(config, "Active"), "full");
  });

  it("allows notes on Acknowledged and denies severity on limited statuses", () => {
    const limited = deniedAlertEditFields(config, "Acknowledged", [
      "severity",
      "status",
      "assignedTo",
      "notes",
    ]);
    assert.deepEqual(limited.denied, ["severity"]);

    const resolved = deniedAlertEditFields(config, "Resolved", [
      "severity",
      "status",
      "notes",
    ]);
    assert.deepEqual(resolved.denied, ["severity"]);
  });
});

describe("repeat-suppression flags", () => {
  it("treats intake and working statuses as live, not Closed / Dismissed / Expired", () => {
    const values = enabledStatusMatchValues(
      config.statuses,
      (status) => status.isIntake || status.suppressesRepeatAlerts
    );
    assert.ok(values.includes("Active"));
    assert.ok(values.includes("Acknowledged"));
    assert.ok(values.includes("Investigating"));
    assert.ok(values.includes("Escalated"));
    assert.ok(values.includes("Resolved"));
    assert.ok(!values.includes("Closed"));
    assert.ok(!values.includes("Dismissed"));
    assert.ok(!values.includes("Expired"));
  });
});
