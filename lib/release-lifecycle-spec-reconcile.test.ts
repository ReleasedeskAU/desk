import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import { reconcileLifecycleSpecDefaults } from "@/lib/release-lifecycle-spec-reconcile";

function edge(
  config: ReturnType<typeof createDefaultReleaseLifecycleConfig>,
  fromKey: string,
  toKey: string
) {
  return config.transitions.find((t) => t.fromKey === fromKey && t.toKey === toKey);
}

function gateTypes(
  config: ReturnType<typeof createDefaultReleaseLifecycleConfig>,
  fromKey: string,
  toKey: string
): string[] {
  return (edge(config, fromKey, toKey)?.gates ?? []).map((g) => g.gateType);
}

describe("reconcileLifecycleSpecDefaults", () => {
  it("adds missing extras and upgrades CFG-06 Required on older graphs", () => {
    const stale = createDefaultReleaseLifecycleConfig();
    stale.transitions = stale.transitions.filter(
      (t) =>
        !(t.fromKey === "testing" && t.toKey === "planning") &&
        !(t.fromKey === "rolled_back" && t.toKey === "cancelled")
    );
    for (const t of stale.transitions) {
      if (t.fromKey === "deploying" || t.fromKey === "deployed") {
        t.enforcement = "flexible";
      }
    }

    const next = reconcileLifecycleSpecDefaults(stale);
    assert.ok(
      next.transitions.some((t) => t.fromKey === "testing" && t.toKey === "planning")
    );
    assert.ok(
      next.transitions.some(
        (t) => t.fromKey === "rolled_back" && t.toKey === "cancelled"
      )
    );
    assert.equal(
      next.transitions.find((t) => t.fromKey === "deploying" && t.toKey === "deployed")
        ?.enforcement,
      "required"
    );
  });

  it("keeps shipped transitions Off after the user toggles them Off", () => {
    const stale = createDefaultReleaseLifecycleConfig();
    const planningBlocked = edge(stale, "planning", "blocked");
    const testingBlocked = edge(stale, "testing", "blocked");
    assert.ok(planningBlocked && testingBlocked);
    planningBlocked.enabled = false;
    testingBlocked.enabled = false;

    const next = reconcileLifecycleSpecDefaults(stale);
    assert.equal(edge(next, "planning", "blocked")?.enabled, false);
    assert.equal(edge(next, "testing", "blocked")?.enabled, false);
    assert.equal(edge(next, "draft", "planning")?.enabled, true);
  });

  it("repairs Planning marked terminal without forcing its edges On", () => {
    const stale = createDefaultReleaseLifecycleConfig();
    const planning = stale.statuses.find((s) => s.key === "planning")!;
    planning.terminal = true;
    planning.kind = "terminal";
    for (const t of stale.transitions) {
      if (t.fromKey === "planning" || t.toKey === "planning") t.enabled = false;
    }

    const next = reconcileLifecycleSpecDefaults(stale);
    const after = next.statuses.find((s) => s.key === "planning")!;
    assert.equal(after.terminal, false);
    assert.equal(after.kind, "mainline");
    assert.equal(edge(next, "planning", "blocked")?.enabled, false);
  });

  it("Wave A: retargets Ready/Deploying Progression Blocker gates off one-stage-late edges", () => {
    // Simulate a pre-Wave-A stored graph (gates on the wrong transitions).
    const stale = createDefaultReleaseLifecycleConfig();
    const cabReady = edge(stale, "cab_approved", "ready_to_deploy");
    const readyDeploy = edge(stale, "ready_to_deploy", "deploying");
    const deployDeployed = edge(stale, "deploying", "deployed");
    assert.ok(cabReady && readyDeploy && deployDeployed);

    cabReady.gates = [
      {
        gateType: "scope_unchanged_since_cab",
        enabled: true,
        enforcement: "inherit",
        sortOrder: 10,
      },
    ];
    readyDeploy.gates = [
      {
        gateType: "rollback_plan_documented",
        enabled: true,
        enforcement: "inherit",
        sortOrder: 10,
      },
      {
        gateType: "pre_deployment_checklist_complete",
        enabled: true,
        enforcement: "inherit",
        sortOrder: 20,
      },
      {
        gateType: "no_open_blockers",
        enabled: true,
        enforcement: "inherit",
        sortOrder: 30,
      },
    ];
    deployDeployed.gates = [
      {
        gateType: "environment_booked_for_deploy",
        enabled: true,
        enforcement: "inherit",
        sortOrder: 10,
      },
      {
        gateType: "hard_dependencies_met",
        enabled: true,
        enforcement: "inherit",
        sortOrder: 20,
      },
    ];

    const next = reconcileLifecycleSpecDefaults(stale);
    const readyGates = gateTypes(next, "cab_approved", "ready_to_deploy");
    const deployingGates = gateTypes(next, "ready_to_deploy", "deploying");
    const deployedGates = gateTypes(next, "deploying", "deployed");

    for (const g of [
      "scope_unchanged_since_cab",
      "no_open_blockers",
      "rollback_plan_documented",
      "pre_deployment_checklist_complete",
      "hard_dependencies_met",
      "high_risks_mitigated",
    ]) {
      assert.ok(readyGates.includes(g), `Ready entry missing ${g}`);
    }
    assert.deepEqual(
      deployingGates.sort(),
      [
        "environment_booked_for_deploy",
        "hard_dependencies_met",
        "no_blocking_incidents",
        "no_expired_env_bookings",
        "outside_change_freeze",
        "work_items_complete",
      ].sort()
    );
    assert.deepEqual(deployedGates, ["deployment_outcome_confirmed"]);
    assert.equal(
      gateTypes(next, "ready_to_deploy", "deploying").includes(
        "rollback_plan_documented"
      ),
      false
    );
  });
});

describe("Wave A default seed attachments", () => {
  it("places Ready-target and Deploying-target gates on the sheet transitions", () => {
    const config = createDefaultReleaseLifecycleConfig();
    assert.deepEqual(
      gateTypes(config, "cab_approved", "ready_to_deploy").sort(),
      [
        "dress_rehearsal_for_large",
        "hard_dependencies_met",
        "high_risks_mitigated",
        "no_open_blockers",
        "no_open_environment_conflicts",
        "ops_signoff_complete",
        "pre_deployment_checklist_complete",
        "rollback_plan_documented",
        "scope_unchanged_since_cab",
      ].sort()
    );
    assert.deepEqual(
      gateTypes(config, "ready_to_deploy", "deploying").sort(),
      [
        "environment_booked_for_deploy",
        "hard_dependencies_met",
        "no_blocking_incidents",
        "no_expired_env_bookings",
        "outside_change_freeze",
        "work_items_complete",
      ].sort()
    );
    assert.deepEqual(gateTypes(config, "deploying", "deployed"), [
      "deployment_outcome_confirmed",
    ]);
    assert.ok(
      gateTypes(config, "deployed", "closed").includes("no_open_incidents")
    );
    assert.ok(gateTypes(config, "deployed", "closed").includes("pir_complete"));
    // Pending CAB → CAB Approved still keeps no_open_blockers (unchanged).
    assert.ok(
      gateTypes(config, "pending_cab", "cab_approved").includes("no_open_blockers")
    );
  });
});
