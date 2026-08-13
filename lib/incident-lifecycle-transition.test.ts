import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultIncidentLifecycleConfig,
  validateIncidentLifecycleConfig,
} from "@/lib/incident-lifecycle-config";
import { reconcileIncidentLifecycleSpec } from "@/lib/incident-lifecycle-spec-reconcile";
import {
  evaluateIncidentGate,
  isCriticalIncidentSeverity,
  legalNextIncidentStatuses,
  resolveIncidentLifecycleStatusRef,
  validateIncidentTransition,
} from "@/lib/incident-lifecycle-transition";
import { incidentGate } from "@/lib/incident-lifecycle-gates";
import {
  deniedIncidentEditFields,
  resolveIncidentEditMode,
} from "@/lib/incident-lifecycle-edit-policy";

const config = createDefaultIncidentLifecycleConfig();

describe("default incident lifecycle", () => {
  it("validates the enterprise default graph", () => {
    assert.equal(validateIncidentLifecycleConfig(config), null);
  });

  it("keeps the open key and shows Active, with Acknowledged as a real status", () => {
    assert.equal(config.statuses.find((s) => s.key === "open")?.label, "Active");
    assert.ok(config.statuses.some((s) => s.key === "acknowledged"));
    assert.equal(
      config.statuses.find((s) => s.key === "resolved")?.unblocksParent,
      true
    );
    assert.ok(
      config.transitions.some(
        (t) => t.fromKey === "open" && t.toKey === "acknowledged"
      )
    );
  });

  it("lists only sheet next steps from Active (extras default Off)", () => {
    const next = legalNextIncidentStatuses(config, "Active").map((s) => s.key);
    assert.deepEqual(next, ["acknowledged", "investigating"]);
  });
});

describe("isCriticalIncidentSeverity", () => {
  it("matches explicit P1 / Critical values only", () => {
    assert.equal(isCriticalIncidentSeverity("P1"), true);
    assert.equal(isCriticalIncidentSeverity("P1 - Critical"), true);
    assert.equal(isCriticalIncidentSeverity("Critical"), true);
    assert.equal(isCriticalIncidentSeverity("P2 - High"), false);
    assert.equal(isCriticalIncidentSeverity("P10"), false);
    assert.equal(isCriticalIncidentSeverity("P1 extra"), false);
  });
});

describe("incident catalog gates", () => {
  it("fails responder confirmation when Assigned To is empty", () => {
    const unmet = evaluateIncidentGate(
      incidentGate("responder_confirmation_set", 10),
      { severity: "P3 - Medium", assignedTo: null }
    );
    assert.match(unmet ?? "", /Assigned To/);
  });

  it("requires override on Active → Acknowledged without a responder", () => {
    const denied = validateIncidentTransition({
      config,
      fromStatus: "Active",
      toStatus: "Acknowledged",
      facts: { severity: "P3 - Medium", assignedTo: null },
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

    const ok = validateIncidentTransition({
      config,
      fromStatus: "Active",
      toStatus: "Acknowledged",
      overrideReason: "Bridge already staffed",
      facts: { severity: "P3 - Medium", assignedTo: null },
    });
    assert.equal(ok.allowed, true);
    if (!ok.allowed) return;
    assert.equal(ok.overridden, true);
  });
});

describe("reconcileIncidentLifecycleSpec", () => {
  it("adds Acknowledged and retitles an untouched Open label", () => {
    const old = createDefaultIncidentLifecycleConfig();
    old.statuses = old.statuses.filter((s) => s.key !== "acknowledged");
    const open = old.statuses.find((s) => s.key === "open");
    if (open) open.label = "Open";
    old.transitions = old.transitions.filter((t) => t.toKey !== "acknowledged");
    const next = reconcileIncidentLifecycleSpec(old);
    assert.ok(next.statuses.some((s) => s.key === "acknowledged"));
    assert.equal(next.statuses.find((s) => s.key === "open")?.label, "Active");
  });
});

describe("resolveIncidentLifecycleStatusRef", () => {
  it("maps Active / Open to the open key and Acknowledged as its own status", () => {
    assert.equal(resolveIncidentLifecycleStatusRef(config, "Active")?.key, "open");
    assert.equal(resolveIncidentLifecycleStatusRef(config, "Open")?.key, "open");
    assert.equal(
      resolveIncidentLifecycleStatusRef(config, "Acknowledged")?.key,
      "acknowledged"
    );
    assert.equal(
      resolveIncidentLifecycleStatusRef(config, "Mitigated")?.key,
      "resolving"
    );
  });
});

describe("validateIncidentTransition", () => {
  it("allows Open → Investigating", () => {
    const result = validateIncidentTransition({
      config,
      fromStatus: "Open",
      toStatus: "Investigating",
      facts: { severity: "Medium", assignedTo: "Ada" },
    });
    assert.equal(result.allowed, true);
    if (!result.allowed) return;
    assert.equal(result.canonicalStatus, "Investigating");
  });

  it("blocks illegal Open → Resolved jump", () => {
    const result = validateIncidentTransition({
      config,
      fromStatus: "Open",
      toStatus: "Resolved",
      facts: { severity: "Medium", assignedTo: "Ada" },
    });
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.code, "ILLEGAL_TRANSITION");
  });

  it("requires override when Critical Open exits without owner (VR-13)", () => {
    const denied = validateIncidentTransition({
      config,
      fromStatus: "Open",
      toStatus: "Investigating",
      facts: { severity: "Critical", assignedTo: null },
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

    const ok = validateIncidentTransition({
      config,
      fromStatus: "Open",
      toStatus: "Investigating",
      overrideReason: "War-room already engaged",
      facts: { severity: "Critical", assignedTo: null },
    });
    assert.equal(ok.allowed, true);
    if (!ok.allowed) return;
    assert.equal(ok.overridden, true);
  });

  it("follows Starting status (isIntake), not the Open key (VR-13)", () => {
    const moved = createDefaultIncidentLifecycleConfig();
    moved.statuses = moved.statuses.map((s) => ({
      ...s,
      isIntake: s.key === "investigating",
    }));
    const fromOpen = validateIncidentTransition({
      config: moved,
      fromStatus: "Open",
      toStatus: "Investigating",
      facts: { severity: "Critical", assignedTo: null },
    });
    assert.equal(fromOpen.allowed, true);

    const fromIntake = validateIncidentTransition({
      config: moved,
      fromStatus: "Investigating",
      toStatus: "Escalated",
      facts: { severity: "Critical", assignedTo: null },
    });
    assert.equal(fromIntake.allowed, false);
    if (fromIntake.allowed) return;
    assert.equal(fromIntake.code, "TRANSITION_NEEDS_OVERRIDE");
    assert.match(fromIntake.unmetReasons?.join(" ") ?? "", /Investigating/);
  });

  it("blocks exit from Closed and blocks Resolved → Reopened when Off (sheet)", () => {
    assert.equal(
      validateIncidentTransition({
        config,
        fromStatus: "Closed",
        toStatus: "Reopened",
        facts: { severity: "Low", assignedTo: "Ada" },
      }).allowed,
      false
    );
    assert.equal(
      validateIncidentTransition({
        config,
        fromStatus: "Resolved",
        toStatus: "Reopened",
        facts: { severity: "Low", assignedTo: "Ada" },
      }).allowed,
      false
    );
  });

  it("allows Resolved → Reopened when an admin turns the edge On", () => {
    const withReopen = createDefaultIncidentLifecycleConfig();
    const edge = withReopen.transitions.find(
      (t) => t.fromKey === "resolved" && t.toKey === "reopened"
    );
    assert.ok(edge);
    edge!.enabled = true;
    assert.equal(
      validateIncidentTransition({
        config: withReopen,
        fromStatus: "Resolved",
        toStatus: "Reopened",
        facts: { severity: "Low", assignedTo: "Ada" },
      }).allowed,
      true
    );
  });
});

describe("incident edit policy", () => {
  it("marks Resolved limited and Closed immutable", () => {
    assert.equal(resolveIncidentEditMode(config, "Resolved"), "limited");
    assert.equal(resolveIncidentEditMode(config, "Closed"), "immutable");
    assert.equal(resolveIncidentEditMode(config, "Active"), "full");
  });

  it("denies title edits on Closed", () => {
    const { denied } = deniedIncidentEditFields(config, "Closed", [
      "title",
      "status",
    ]);
    assert.deepEqual(denied, ["title"]);
  });
});
