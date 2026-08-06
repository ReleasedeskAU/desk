import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RELEASE_LIFECYCLE_CONFIG,
  createDefaultReleaseLifecycleConfig,
  normalizeReleaseLifecycleConfig,
  validateReleaseLifecycleConfig,
  type ReleaseLifecycleConfig,
} from "./release-lifecycle-config";
import { RELEASE_LIFECYCLE_GATE_CATALOG } from "./release-lifecycle-gates";

const CANONICAL_LABELS = [
  "Draft",
  "Planning",
  "Testing",
  "UAT",
  "Pending CAB",
  "CAB Approved",
  "Ready to deploy",
  "Deploying",
  "Deployed",
  "Closed",
  "Cancelled",
  "Blocked",
  "Rolled Back",
  "Deferred",
  "Rejected",
];

function transition(fromKey: string, toKey: string | null) {
  return DEFAULT_RELEASE_LIFECYCLE_CONFIG.transitions.find(
    (item) => item.fromKey === fromKey && item.toKey === toKey
  );
}

describe("default Release lifecycle configuration", () => {
  it("ships exactly the locked 15 statuses and reviewed graph", () => {
    assert.deepEqual(
      DEFAULT_RELEASE_LIFECYCLE_CONFIG.statuses.map((status) => status.label),
      CANONICAL_LABELS
    );
    assert.equal(DEFAULT_RELEASE_LIFECYCLE_CONFIG.transitions.length, 35);
    assert.equal(validateReleaseLifecycleConfig(DEFAULT_RELEASE_LIFECYCLE_CONFIG), null);
    assert.equal(transition("blocked", null)?.isPreviousStatus, true);
    assert.equal(transition("deferred", "pending_cab")?.enabled, true);
    assert.equal(transition("rejected", "planning")?.enabled, true);
  });

  it("keeps the two future hard-gate transitions Flexible with explicit follow-ups", () => {
    assert.equal(transition("deploying", "deployed")?.enforcement, "flexible");
    assert.equal(transition("deployed", "closed")?.enforcement, "flexible");
    assert.match(
      RELEASE_LIFECYCLE_GATE_CATALOG.environment_booked_for_deploy
        .futureFollowUp ?? "",
      /before making Deploying/
    );
    assert.match(
      RELEASE_LIFECYCLE_GATE_CATALOG.post_deployment_validation_complete
        .futureFollowUp ?? "",
      /before making Deployed/
    );
  });

  it("returns independent default objects", () => {
    const first = createDefaultReleaseLifecycleConfig();
    const second = createDefaultReleaseLifecycleConfig();
    first.statuses[0]!.label = "Changed";
    first.transitions[0]!.gates.push({
      gateType: "owner_set",
      enabled: true,
      enforcement: "inherit",
      sortOrder: 99,
    });
    assert.equal(second.statuses[0]!.label, "Draft");
    assert.equal(second.transitions[0]!.gates.length, 0);
  });
});

describe("validateReleaseLifecycleConfig", () => {
  it("rejects duplicate labels and orphan transitions", () => {
    const duplicate = createDefaultReleaseLifecycleConfig();
    duplicate.statuses[1]!.label = "Draft";
    assert.match(validateReleaseLifecycleConfig(duplicate) ?? "", /Duplicate status label/);

    const orphan = createDefaultReleaseLifecycleConfig();
    orphan.transitions[0]!.toKey = "missing";
    assert.match(validateReleaseLifecycleConfig(orphan) ?? "", /Unknown transition target/);
  });

  it("rejects free-form gates and invalid previous-status edges", () => {
    const unknownGate = createDefaultReleaseLifecycleConfig();
    unknownGate.transitions[0]!.gates.push({
      gateType: "run_javascript" as never,
      enabled: true,
      enforcement: "inherit",
      sortOrder: 10,
    });
    assert.match(validateReleaseLifecycleConfig(unknownGate) ?? "", /Unknown gate type/);

    const invalidPrevious = createDefaultReleaseLifecycleConfig();
    invalidPrevious.transitions[0]!.toKey = null;
    invalidPrevious.transitions[0]!.isPreviousStatus = true;
    assert.match(
      validateReleaseLifecycleConfig(invalidPrevious) ?? "",
      /Only Blocked/
    );
  });

  it("accepts a custom status and transition without free-form logic", () => {
    const custom = createDefaultReleaseLifecycleConfig();
    custom.statuses.push({
      key: "security_review",
      label: "Security Review",
      sortOrder: 65,
      terminal: false,
      kind: "branch",
      isSystem: false,
      enabled: true,
    });
    custom.transitions.push({
      fromKey: "cab_approved",
      toKey: "security_review",
      isPreviousStatus: false,
      enabled: true,
      enforcement: "flexible",
      isSystem: false,
      sortOrder: 50,
      gates: [
        {
          gateType: "required_fields_set",
          enabled: true,
          enforcement: "inherit",
          params: { fields: ["owner", "priority"] },
          sortOrder: 10,
        },
      ],
    });
    assert.equal(validateReleaseLifecycleConfig(custom), null);
  });
});

describe("normalizeReleaseLifecycleConfig", () => {
  it("fails open to defaults for an invalid stored graph", () => {
    const invalid = createDefaultReleaseLifecycleConfig();
    invalid.transitions[0]!.fromKey = "unknown";
    const normalized = normalizeReleaseLifecycleConfig(
      invalid as ReleaseLifecycleConfig
    );
    assert.deepEqual(
      normalized.statuses.map((status) => status.label),
      CANONICAL_LABELS
    );
  });
});
