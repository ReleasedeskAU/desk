import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultRiskLifecycleConfig,
  validateRiskLifecycleConfig,
} from "@/lib/risk-lifecycle-config";
import {
  resolveRiskLifecycleStatusRef,
  validateRiskTransition,
} from "@/lib/risk-lifecycle-transition";
import {
  deniedRiskEditFields,
  resolveRiskEditMode,
} from "@/lib/risk-lifecycle-edit-policy";

const config = createDefaultRiskLifecycleConfig();

const baseFacts = {
  likelihood: 3,
  impact: 3,
  riskScore: 9,
  mitigationStrategy: "Add monitoring",
  notes: "Accepted by RM",
};

describe("default risk lifecycle", () => {
  it("validates the enterprise default graph", () => {
    assert.equal(validateRiskLifecycleConfig(config), null);
  });
});

describe("resolveRiskLifecycleStatusRef", () => {
  it("maps legacy Open / Monitoring / In Progress aliases", () => {
    assert.equal(resolveRiskLifecycleStatusRef(config, "Open")?.key, "identified");
    assert.equal(resolveRiskLifecycleStatusRef(config, "Monitoring")?.key, "assessing");
    assert.equal(resolveRiskLifecycleStatusRef(config, "In Progress")?.key, "mitigating");
    assert.equal(resolveRiskLifecycleStatusRef(config, "Mitigated")?.key, "mitigated");
  });
});

describe("validateRiskTransition", () => {
  it("allows Identified → Assessing when score dimensions exist", () => {
    const result = validateRiskTransition({
      config,
      fromStatus: "Open",
      toStatus: "Assessing",
      facts: baseFacts,
    });
    assert.equal(result.allowed, true);
    if (!result.allowed) return;
    assert.equal(result.canonicalStatus, "Assessing");
  });

  it("blocks illegal Identified → Mitigated jump", () => {
    const result = validateRiskTransition({
      config,
      fromStatus: "Identified",
      toStatus: "Mitigated",
      facts: baseFacts,
    });
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.code, "ILLEGAL_TRANSITION");
  });

  it("requires override when High Mitigating → Mitigated lacks a plan", () => {
    const denied = validateRiskTransition({
      config,
      fromStatus: "Mitigating",
      toStatus: "Mitigated",
      facts: {
        likelihood: 5,
        impact: 5,
        riskScore: 25,
        mitigationStrategy: null,
        notes: null,
      },
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

    const ok = validateRiskTransition({
      config,
      fromStatus: "Mitigating",
      toStatus: "Mitigated",
      overrideReason: "Accepted residual without formal plan",
      facts: {
        likelihood: 5,
        impact: 5,
        riskScore: 25,
        mitigationStrategy: null,
        notes: null,
      },
    });
    assert.equal(ok.allowed, true);
    if (!ok.allowed) return;
    assert.equal(ok.overridden, true);
  });

  it("blocks any exit from Closed", () => {
    const result = validateRiskTransition({
      config,
      fromStatus: "Closed",
      toStatus: "Identified",
      facts: baseFacts,
    });
    assert.equal(result.allowed, false);
  });

  it("allows Escalated → Mitigating and Escalated inbound", () => {
    assert.equal(
      validateRiskTransition({
        config,
        fromStatus: "Escalated",
        toStatus: "Mitigating",
        facts: baseFacts,
      }).allowed,
      true
    );
    assert.equal(
      validateRiskTransition({
        config,
        fromStatus: "Assessing",
        toStatus: "Escalated",
        facts: baseFacts,
      }).allowed,
      true
    );
  });
});

describe("risk edit policy", () => {
  it("marks Mitigated limited, Accepted read_only, Closed immutable", () => {
    assert.equal(resolveRiskEditMode(config, "Mitigated"), "limited");
    assert.equal(resolveRiskEditMode(config, "Accepted"), "read_only");
    assert.equal(resolveRiskEditMode(config, "Closed"), "immutable");
    assert.equal(resolveRiskEditMode(config, "Open"), "full");
  });

  it("denies description edits on Accepted", () => {
    const { denied } = deniedRiskEditFields(config, "Accepted", [
      "description",
      "notes",
      "status",
    ]);
    assert.deepEqual(denied, ["description"]);
  });
});
