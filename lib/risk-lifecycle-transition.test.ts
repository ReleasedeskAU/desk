import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultRiskLifecycleConfig,
  validateRiskLifecycleConfig,
} from "@/lib/risk-lifecycle-config";
import {
  evaluateRiskGate,
  legalNextRiskStatuses,
  resolveRiskLifecycleStatusRef,
  validateRiskTransition,
} from "@/lib/risk-lifecycle-transition";
import { riskGate } from "@/lib/risk-lifecycle-gates";
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
    assert.equal(resolveRiskLifecycleStatusRef(config, "Monitoring")?.key, "mitigated");
    assert.equal(resolveRiskLifecycleStatusRef(config, "In Progress")?.key, "assessing");
    assert.equal(resolveRiskLifecycleStatusRef(config, "Mitigated")?.key, "mitigated");
  });

  it("keeps stable keys behind the relabeled enterprise statuses", () => {
    assert.equal(resolveRiskLifecycleStatusRef(config, "Open")?.key, "identified");
    assert.equal(resolveRiskLifecycleStatusRef(config, "In Progress")?.key, "assessing");
    assert.equal(resolveRiskLifecycleStatusRef(config, "Monitoring")?.key, "mitigated");
  });
});

describe("validateRiskTransition", () => {
  it("allows Open → In Progress when score dimensions exist", () => {
    const result = validateRiskTransition({
      config,
      fromStatus: "Open",
      toStatus: "In Progress",
      facts: baseFacts,
    });
    assert.equal(result.allowed, true);
    if (!result.allowed) return;
    assert.equal(result.canonicalStatus, "In Progress");
  });

  it("blocks illegal Identified → Mitigated jump", () => {
    const result = validateRiskTransition({
      config,
      fromStatus: "Open",
      toStatus: "Monitoring",
      facts: baseFacts,
    });
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.code, "ILLEGAL_TRANSITION");
  });

  it("requires override when High Mitigating → Monitoring lacks a plan", () => {
    const denied = validateRiskTransition({
      config,
      fromStatus: "Mitigating",
      toStatus: "Monitoring",
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
      toStatus: "Monitoring",
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
        fromStatus: "In Progress",
        toStatus: "Escalated",
        facts: baseFacts,
      }).allowed,
      true
    );
  });

  it("supports the added sheet edges and keeps direct-to-Closed", () => {
    const moves = legalNextRiskStatuses(config, "Open").map((status) => status.key);
    assert.deepEqual(moves, ["assessing", "accepted", "closed", "escalated"]);
    assert.equal(
      validateRiskTransition({
        config,
        fromStatus: "Escalated",
        toStatus: "In Progress",
        facts: baseFacts,
      }).allowed,
      true
    );
    assert.equal(
      validateRiskTransition({
        config,
        fromStatus: "Monitoring",
        toStatus: "Open",
        facts: baseFacts,
      }).allowed,
      true
    );
  });

  it("checks documented acceptance when entering Accepted", () => {
    const denied = validateRiskTransition({
      config,
      fromStatus: "Open",
      toStatus: "Accepted",
      facts: { ...baseFacts, notes: null },
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

    const leaving = validateRiskTransition({
      config,
      fromStatus: "Accepted",
      toStatus: "Monitoring",
      facts: { ...baseFacts, notes: null },
    });
    assert.equal(leaving.allowed, true);
  });

  it("uses combined score only for the High mitigation-plan gate", () => {
    assert.equal(
      evaluateRiskGate(riskGate("mitigation_plan_for_high", 10), {
        ...baseFacts,
        likelihood: 4,
        impact: 1,
        riskScore: 4,
        mitigationStrategy: null,
      }),
      null
    );
    assert.match(
      evaluateRiskGate(riskGate("mitigation_plan_for_high", 10), {
        ...baseFacts,
        likelihood: 5,
        impact: 3,
        riskScore: 15,
        mitigationStrategy: null,
      }) ?? "",
      /mitigation plan/i
    );
  });

  it("requires a reason for Accepted and Monitoring reversals", () => {
    for (const fromStatus of ["Accepted", "Monitoring"]) {
      const denied = validateRiskTransition({
        config,
        fromStatus,
        toStatus: "Mitigating",
        facts: { ...baseFacts, reversalReason: null },
      });
      assert.equal(denied.allowed, false);
      if (denied.allowed) continue;
      assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

      const reason = "New evidence changed the mitigation plan";
      const allowed = validateRiskTransition({
        config,
        fromStatus,
        toStatus: "Mitigating",
        overrideReason: reason,
        facts: { ...baseFacts, reversalReason: reason },
      });
      assert.equal(allowed.allowed, true);
    }
  });
});

describe("risk edit policy", () => {
  it("marks Monitoring limited, Accepted read_only, Closed immutable", () => {
    assert.equal(resolveRiskEditMode(config, "Monitoring"), "limited");
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
