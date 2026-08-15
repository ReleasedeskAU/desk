import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultRiskLifecycleConfig,
  type RiskLifecycleConfig,
} from "@/lib/risk-lifecycle-config";
import { reconcileRiskLifecycleSpec } from "@/lib/risk-lifecycle-spec-reconcile";

describe("reconcileRiskLifecycleSpec", () => {
  it("relabels untouched defaults and adds graph edges/checks", () => {
    const legacy = createDefaultRiskLifecycleConfig();
    legacy.statuses.find((status) => status.key === "identified")!.label =
      "Identified";
    legacy.statuses.find((status) => status.key === "assessing")!.label =
      "Assessing";
    legacy.statuses.find((status) => status.key === "mitigated")!.label =
      "Mitigated";
    legacy.transitions = legacy.transitions.filter(
      (transition) =>
        !(
          transition.fromKey === "accepted" &&
          transition.toKey === "mitigating"
        )
    );
    const acceptedEdge = legacy.transitions.find(
      (transition) =>
        transition.fromKey === "identified" &&
        transition.toKey === "accepted"
    )!;
    acceptedEdge.gates = [];

    const reconciled = reconcileRiskLifecycleSpec(legacy);

    assert.equal(
      reconciled.statuses.find((status) => status.key === "identified")?.label,
      "Open"
    );
    assert.ok(
      reconciled.transitions.some(
        (transition) =>
          transition.fromKey === "accepted" &&
          transition.toKey === "mitigating"
      )
    );
    assert.deepEqual(
      reconciled.transitions
        .find(
          (transition) =>
            transition.fromKey === "identified" &&
            transition.toKey === "accepted"
        )
        ?.gates.map((gate) => gate.gateType),
      ["likelihood_impact_set", "acceptance_documented"]
    );
  });

  it("preserves a user-renamed display label and extra edge", () => {
    const custom = createDefaultRiskLifecycleConfig() as RiskLifecycleConfig;
    custom.statuses.find((status) => status.key === "identified")!.label =
      "Reported";
    custom.transitions.push({
      fromKey: "accepted",
      toKey: "identified",
      enabled: true,
      enforcement: "flexible",
      isSystem: false,
      sortOrder: 99,
      gates: [],
    });

    const reconciled = reconcileRiskLifecycleSpec(custom);

    assert.equal(
      reconciled.statuses.find((status) => status.key === "identified")?.label,
      "Reported"
    );
    assert.ok(
      reconciled.transitions.some(
        (transition) =>
          transition.fromKey === "accepted" &&
          transition.toKey === "identified"
      )
    );
  });
});
