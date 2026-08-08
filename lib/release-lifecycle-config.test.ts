import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RELEASE_LIFECYCLE_CONFIG,
  createDefaultReleaseLifecycleConfig,
  normalizeReleaseLifecycleConfig,
  normalizeReleaseLifecycleConfigResult,
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
    assert.equal(DEFAULT_RELEASE_LIFECYCLE_CONFIG.transitions.length, 37);
    assert.equal(validateReleaseLifecycleConfig(DEFAULT_RELEASE_LIFECYCLE_CONFIG), null);
    assert.equal(transition("blocked", null)?.isPreviousStatus, true);
    assert.equal(transition("deferred", "pending_cab")?.enabled, true);
    assert.equal(transition("rejected", "planning")?.enabled, true);
  });

  it("marks Deploying/Deployed exits Required (CFG-06)", () => {
    assert.equal(transition("deploying", "deployed")?.enforcement, "required");
    assert.equal(transition("deploying", "rolled_back")?.enforcement, "required");
    assert.equal(transition("deploying", "blocked")?.enforcement, "required");
    assert.equal(transition("deployed", "closed")?.enforcement, "required");
    assert.equal(transition("deployed", "rolled_back")?.enforcement, "required");
    assert.ok(
      transition("deferred", "pending_cab")?.gates.some(
        (g) => g.gateType === "reactivation_decision_recorded"
      )
    );
    assert.ok(
      transition("rejected", "planning")?.gates.some(
        (g) => g.gateType === "rework_acknowledged"
      )
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

    // draft is mainline — previous-status is reserved for interrupt kinds.
    const invalidPrevious = createDefaultReleaseLifecycleConfig();
    invalidPrevious.transitions[0]!.toKey = null;
    invalidPrevious.transitions[0]!.isPreviousStatus = true;
    assert.match(
      validateReleaseLifecycleConfig(invalidPrevious) ?? "",
      /Only interrupt statuses may transition to previous status/
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
  it("fails open to defaults for an invalid stored graph and flags the fallback", () => {
    const invalid = createDefaultReleaseLifecycleConfig();
    invalid.transitions[0]!.fromKey = "unknown";
    const result = normalizeReleaseLifecycleConfigResult(
      invalid as ReleaseLifecycleConfig
    );
    assert.equal(result.usedEnterpriseDefaultFallback, true);
    assert.match(result.fallbackReason ?? "", /Unknown transition source/);
    assert.deepEqual(
      result.config.statuses.map((status) => status.label),
      CANONICAL_LABELS
    );
    // Thin wrapper still returns the substituted config.
    assert.deepEqual(
      normalizeReleaseLifecycleConfig(invalid as ReleaseLifecycleConfig).statuses.map(
        (status) => status.label
      ),
      CANONICAL_LABELS
    );
  });

  it("does not flag a missing graph as a corruption fallback", () => {
    const result = normalizeReleaseLifecycleConfigResult(null);
    assert.equal(result.usedEnterpriseDefaultFallback, false);
    assert.equal(result.fallbackReason, null);
    assert.equal(result.config.statuses.length, 15);
  });
});

/**
 * Section 6 "second config" audit — a deliberately different lifecycle that is
 * NOT the 15-status Enterprise Default. Proves validation/normalize are
 * config-driven rather than silently assuming the default vocabulary.
 */
const COMPACT_LABELS = ["Draft", "In Review", "Approved", "Live"];

function createCompactReleaseLifecycleConfig(): ReleaseLifecycleConfig {
  return {
    statuses: [
      {
        key: "draft",
        label: "Draft",
        sortOrder: 10,
        terminal: false,
        kind: "mainline",
        isSystem: false,
        enabled: true,
      },
      {
        key: "in_review",
        label: "In Review",
        sortOrder: 20,
        terminal: false,
        kind: "mainline",
        isSystem: false,
        enabled: true,
      },
      {
        key: "approved",
        label: "Approved",
        sortOrder: 30,
        terminal: false,
        kind: "mainline",
        isSystem: false,
        enabled: true,
      },
      {
        key: "live",
        label: "Live",
        sortOrder: 40,
        terminal: true,
        kind: "terminal",
        isSystem: false,
        enabled: true,
      },
    ],
    transitions: [
      {
        fromKey: "draft",
        toKey: "in_review",
        isPreviousStatus: false,
        enabled: true,
        // Different from Enterprise Default (all Flexible): hard-require owner+priority.
        enforcement: "required",
        isSystem: false,
        sortOrder: 10,
        gates: [
          {
            gateType: "required_fields_set",
            enabled: true,
            enforcement: "inherit",
            params: { fields: ["owner", "priority"] },
            sortOrder: 10,
          },
        ],
      },
      {
        fromKey: "in_review",
        toKey: "approved",
        isPreviousStatus: false,
        enabled: true,
        enforcement: "flexible",
        isSystem: false,
        sortOrder: 10,
        // Renamed/different gate placement: sign-offs gate the review→approved
        // step directly (no Pending CAB / CAB Approved stages in this template).
        gates: [
          {
            gateType: "signoffs_complete",
            enabled: true,
            enforcement: "required",
            sortOrder: 10,
          },
        ],
      },
      {
        fromKey: "in_review",
        toKey: "draft",
        isPreviousStatus: false,
        enabled: true,
        enforcement: "flexible",
        isSystem: false,
        sortOrder: 20,
        gates: [],
      },
      {
        fromKey: "approved",
        toKey: "live",
        isPreviousStatus: false,
        enabled: true,
        enforcement: "flexible",
        isSystem: false,
        sortOrder: 10,
        gates: [
          {
            gateType: "go_live_date_set",
            enabled: true,
            enforcement: "inherit",
            sortOrder: 10,
          },
          {
            gateType: "no_open_blockers",
            enabled: true,
            enforcement: "inherit",
            sortOrder: 20,
          },
        ],
      },
    ],
  };
}

describe("second config — compact 4-status lifecycle (Section 6 audit)", () => {
  it("validates a 4-status graph with different transitions and gates", () => {
    const compact = createCompactReleaseLifecycleConfig();
    assert.deepEqual(
      compact.statuses.map((status) => status.label),
      COMPACT_LABELS
    );
    assert.equal(compact.statuses.length, 4);
    assert.equal(compact.transitions.length, 4);
    assert.notEqual(compact.statuses.length, DEFAULT_RELEASE_LIFECYCLE_CONFIG.statuses.length);
    assert.equal(validateReleaseLifecycleConfig(compact), null);

    const reviewToApproved = compact.transitions.find(
      (item) => item.fromKey === "in_review" && item.toKey === "approved"
    );
    assert.equal(reviewToApproved?.gates[0]?.gateType, "signoffs_complete");
    assert.equal(reviewToApproved?.gates[0]?.enforcement, "required");
    assert.equal(
      compact.transitions.find((item) => item.fromKey === "draft")?.enforcement,
      "required"
    );
  });

  it("rejects duplicate labels and orphan transitions on the compact graph", () => {
    const duplicate = createCompactReleaseLifecycleConfig();
    duplicate.statuses[1]!.label = "Draft";
    assert.match(validateReleaseLifecycleConfig(duplicate) ?? "", /Duplicate status label/);

    const orphan = createCompactReleaseLifecycleConfig();
    orphan.transitions[0]!.toKey = "missing";
    assert.match(validateReleaseLifecycleConfig(orphan) ?? "", /Unknown transition target/);
  });

  it("normalize preserves a valid compact graph (does not rewrite to Enterprise Default)", () => {
    const compact = createCompactReleaseLifecycleConfig();
    const normalized = normalizeReleaseLifecycleConfig(compact);
    assert.deepEqual(
      normalized.statuses.map((status) => status.label),
      COMPACT_LABELS
    );
    assert.equal(normalized.transitions.length, 4);
    assert.notDeepEqual(
      normalized.statuses.map((status) => status.label),
      CANONICAL_LABELS
    );
  });

  it("rejects free-form gates on the compact graph", () => {
    const unknownGate = createCompactReleaseLifecycleConfig();
    unknownGate.transitions[0]!.gates.push({
      gateType: "run_javascript" as never,
      enabled: true,
      enforcement: "inherit",
      sortOrder: 99,
    });
    assert.match(validateReleaseLifecycleConfig(unknownGate) ?? "", /Unknown gate type/);
  });

  it("allows previous-status from any interrupt status key (not only blocked)", () => {
    const withHold = createCompactReleaseLifecycleConfig();
    withHold.statuses.push({
      key: "on_hold",
      label: "On Hold",
      sortOrder: 50,
      terminal: false,
      kind: "interrupt",
      isSystem: false,
      enabled: true,
    });
    withHold.transitions.push({
      fromKey: "in_review",
      toKey: "on_hold",
      isPreviousStatus: false,
      enabled: true,
      enforcement: "flexible",
      isSystem: false,
      sortOrder: 30,
      gates: [],
    });
    withHold.transitions.push({
      fromKey: "on_hold",
      toKey: null,
      isPreviousStatus: true,
      enabled: true,
      enforcement: "flexible",
      isSystem: false,
      sortOrder: 10,
      gates: [],
    });
    assert.equal(validateReleaseLifecycleConfig(withHold), null);
  });
});
