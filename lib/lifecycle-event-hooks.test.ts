import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDriftEscalatedStatus,
  orderedReleaseCodes,
} from "@/lib/lifecycle-event-hook-helpers";
import {
  createDefaultReleaseLifecycleConfig,
  type ReleaseLifecycleGateAttachment,
} from "@/lib/release-lifecycle-config";
import {
  emptyLifecycleGateFacts,
  evaluateLifecycleGate,
} from "@/lib/release-lifecycle-transition";

describe("lifecycle event hook helpers", () => {
  it("orders release codes stably for conflict pairs", () => {
    assert.deepEqual(orderedReleaseCodes("REL-0002", "REL-0001"), [
      "REL-0001",
      "REL-0002",
    ]);
  });

  it("detects Escalated drift status", () => {
    assert.equal(isDriftEscalatedStatus("Escalated"), true);
    assert.equal(isDriftEscalatedStatus("Investigating"), false);
  });
});

describe("AV-06 no_blocking_incidents gate", () => {
  const config = createDefaultReleaseLifecycleConfig();
  const edge = config.transitions.find(
    (t) => t.fromKey === "ready_to_deploy" && t.toKey === "deploying"
  )!;
  const gate: ReleaseLifecycleGateAttachment = {
    gateType: "no_blocking_incidents",
    enabled: true,
    enforcement: "inherit",
    sortOrder: 30,
  };

  it("passes when blockingIncidentCount is 0", () => {
    const result = evaluateLifecycleGate(
      gate,
      emptyLifecycleGateFacts({ blockingIncidentCount: 0 }),
      edge
    );
    assert.equal(result.passed, true);
  });

  it("fails when blocking incidents remain", () => {
    const result = evaluateLifecycleGate(
      gate,
      emptyLifecycleGateFacts({ blockingIncidentCount: 2 }),
      edge
    );
    assert.equal(result.passed, false);
  });

  it("is attached to ready_to_deploy → deploying by default", () => {
    assert.ok(edge);
    assert.ok(edge.gates.some((g) => g.gateType === "no_blocking_incidents"));
  });
});

describe("Tranche 1 progression gates", () => {
  const config = createDefaultReleaseLifecycleConfig();

  it("VR-30: test_signoff_complete blocks Testing → UAT when incomplete", () => {
    const edge = config.transitions.find(
      (t) => t.fromKey === "testing" && t.toKey === "uat"
    )!;
    const gate: ReleaseLifecycleGateAttachment = {
      gateType: "test_signoff_complete",
      enabled: true,
      enforcement: "inherit",
      sortOrder: 20,
    };
    assert.equal(
      evaluateLifecycleGate(
        gate,
        emptyLifecycleGateFacts({ testSignoffComplete: false }),
        edge
      ).passed,
      false
    );
    assert.equal(
      evaluateLifecycleGate(
        gate,
        emptyLifecycleGateFacts({ testSignoffComplete: true }),
        edge
      ).passed,
      true
    );
  });

  it("VR-32 / VR-26: Ready-entry conflict hard-fail and Large dress-rehearsal warn", () => {
    const edge = config.transitions.find(
      (t) => t.fromKey === "cab_approved" && t.toKey === "ready_to_deploy"
    )!;
    const conflictGate: ReleaseLifecycleGateAttachment = {
      gateType: "no_open_environment_conflicts",
      enabled: true,
      enforcement: "inherit",
      sortOrder: 60,
    };
    assert.equal(
      evaluateLifecycleGate(
        conflictGate,
        emptyLifecycleGateFacts({ openEnvironmentConflictCount: 1 }),
        edge
      ).passed,
      false
    );

    const dressGate = edge.gates.find(
      (g) => g.gateType === "dress_rehearsal_for_large"
    )!;
    assert.equal(dressGate.enforcement, "flexible");
    assert.equal(
      evaluateLifecycleGate(
        dressGate,
        emptyLifecycleGateFacts({
          releaseSize: "Medium",
          dressRehearsalComplete: false,
        }),
        edge
      ).passed,
      true
    );
    assert.equal(
      evaluateLifecycleGate(
        dressGate,
        emptyLifecycleGateFacts({
          releaseSize: "Large",
          dressRehearsalComplete: false,
        }),
        edge
      ).passed,
      false
    );
  });

  it("AV-08 / VR-05: expired booking and change freeze block Deploying entry", () => {
    const edge = config.transitions.find(
      (t) => t.fromKey === "ready_to_deploy" && t.toKey === "deploying"
    )!;
    assert.equal(
      evaluateLifecycleGate(
        {
          gateType: "no_expired_env_bookings",
          enabled: true,
          enforcement: "inherit",
          sortOrder: 40,
        },
        emptyLifecycleGateFacts({ expiredEnvBookingCount: 1 }),
        edge
      ).passed,
      false
    );
    assert.equal(
      evaluateLifecycleGate(
        {
          gateType: "outside_change_freeze",
          enabled: true,
          enforcement: "inherit",
          sortOrder: 50,
        },
        emptyLifecycleGateFacts({ changeFreezeActive: true }),
        edge
      ).passed,
      false
    );
  });

  it("§4-08 / VR-33: Verified outcome and open incidents on Deployed/Closed edges", () => {
    const toDeployed = config.transitions.find(
      (t) => t.fromKey === "deploying" && t.toKey === "deployed"
    )!;
    const toClosed = config.transitions.find(
      (t) => t.fromKey === "deployed" && t.toKey === "closed"
    )!;
    assert.equal(
      evaluateLifecycleGate(
        {
          gateType: "deployment_outcome_confirmed",
          enabled: true,
          enforcement: "inherit",
          sortOrder: 10,
        },
        emptyLifecycleGateFacts({ deploymentOutcomeConfirmed: true }),
        toDeployed
      ).passed,
      true
    );
    assert.equal(
      evaluateLifecycleGate(
        {
          gateType: "no_open_incidents",
          enabled: true,
          enforcement: "inherit",
          sortOrder: 20,
        },
        emptyLifecycleGateFacts({ openIncidentCount: 2 }),
        toClosed
      ).passed,
      false
    );
  });

  it("T2–T4: scope snapshot, ops sign-off, work items, PIR gates", () => {
    const ready = config.transitions.find(
      (t) => t.fromKey === "cab_approved" && t.toKey === "ready_to_deploy"
    )!;
    const deploying = config.transitions.find(
      (t) => t.fromKey === "ready_to_deploy" && t.toKey === "deploying"
    )!;
    const closed = config.transitions.find(
      (t) => t.fromKey === "deployed" && t.toKey === "closed"
    )!;
    assert.equal(
      evaluateLifecycleGate(
        {
          gateType: "scope_unchanged_since_cab",
          enabled: true,
          enforcement: "inherit",
          sortOrder: 10,
        },
        emptyLifecycleGateFacts({
          releaseSize: "L",
          priority: "P1",
          scopeDescription: "A",
          cabScopeSnapshot: {
            releaseSize: "L",
            priority: "P1",
            scopeDescription: "A",
          },
        }),
        ready
      ).passed,
      true
    );
    assert.equal(
      evaluateLifecycleGate(
        {
          gateType: "ops_signoff_complete",
          enabled: true,
          enforcement: "inherit",
          sortOrder: 80,
        },
        emptyLifecycleGateFacts({ opsSignoffComplete: false }),
        ready
      ).passed,
      false
    );
    assert.equal(
      evaluateLifecycleGate(
        {
          gateType: "work_items_complete",
          enabled: true,
          enforcement: "inherit",
          sortOrder: 60,
        },
        emptyLifecycleGateFacts({ incompleteWorkItemCount: 3 }),
        deploying
      ).passed,
      false
    );
    assert.equal(
      evaluateLifecycleGate(
        {
          gateType: "pir_complete",
          enabled: true,
          enforcement: "inherit",
          sortOrder: 30,
        },
        emptyLifecycleGateFacts({ pirComplete: false }),
        closed
      ).passed,
      false
    );
  });
});
