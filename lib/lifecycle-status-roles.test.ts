import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import { createDefaultBlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config";
import { createDefaultIncidentLifecycleConfig } from "@/lib/incident-lifecycle-config";
import { createDefaultRiskLifecycleConfig } from "@/lib/risk-lifecycle-config";
import { createDefaultDependencyLifecycleConfig } from "@/lib/dependency-lifecycle-config";
import { createDefaultApprovalLifecycleConfig } from "@/lib/approval-lifecycle-config";
import {
  applyStatusRolePatch,
  coalesceBoolean,
  coalesceDays,
  enabledStatusLabelsWhere,
  enabledStatusMatchValues,
  exclusiveRoleHitCount,
  exclusiveRoleIssues,
  automationRoleIssues,
  fillMissingRoleFields,
  missingExclusiveRoleError,
  resolveExclusiveRole,
  uniqueEnabledStatusWhere,
  STATUS_ROLE_FIELDS,
} from "@/lib/lifecycle-status-roles";

describe("lifecycle status roles", () => {
  it("keeps Settings copy in plain English (no raw id as the label)", () => {
    for (const [id, field] of Object.entries(STATUS_ROLE_FIELDS)) {
      assert.notEqual(field.label, id);
      assert.ok(field.description.length > 20);
    }
  });

  it("lists enabled labels matching a flag", () => {
    const statuses = [
      { enabled: true, label: "Open", blocksLinkedRelease: true },
      { enabled: true, label: "Closed", blocksLinkedRelease: false },
      { enabled: false, label: "Reopened", blocksLinkedRelease: true },
    ];
    assert.deepEqual(
      enabledStatusLabelsWhere(statuses, (s) => s.blocksLinkedRelease),
      ["Open"]
    );
  });

  it("includes label and key for Prisma status matching", () => {
    const values = enabledStatusMatchValues(
      [
        { enabled: true, key: "open", label: "New", blocksLinkedRelease: true },
        { enabled: true, key: "closed", label: "Closed", blocksLinkedRelease: false },
      ],
      (s) => s.blocksLinkedRelease === true
    );
    assert.deepEqual(values.sort(), ["New", "open"].sort());
  });

  it("treats 0 and 2+ exclusive hits as not unique", () => {
    const none = [{ enabled: true, isIntake: false, key: "a" }];
    const two = [
      { enabled: true, isIntake: true, key: "a" },
      { enabled: true, isIntake: true, key: "b" },
    ];
    assert.equal(uniqueEnabledStatusWhere(none, (s) => s.isIntake), null);
    assert.equal(exclusiveRoleHitCount(two, (s) => s.isIntake), 2);
    assert.equal(uniqueEnabledStatusWhere(two, (s) => s.isIntake), null);
  });

  it("clears an exclusive flag on siblings when turned on", () => {
    const next = applyStatusRolePatch(
      [
        { key: "open", isIntake: true },
        { key: "active", isIntake: false },
      ],
      "active",
      { isIntake: true },
      ["isIntake"]
    );
    assert.equal(next[0]?.isIntake, false);
    assert.equal(next[1]?.isIntake, true);
  });

  it("fills missing role fields from defaults without clobbering false", () => {
    const filled = fillMissingRoleFields(
      { key: "open", isIntake: false },
      { key: "open", isIntake: true },
      ["isIntake"]
    );
    assert.equal(filled.isIntake, false);
    const missing = fillMissingRoleFields(
      { key: "open" },
      { key: "open", isIntake: true },
      ["isIntake"]
    );
    assert.equal(missing.isIntake, true);
  });

  it("coerces days and booleans", () => {
    assert.equal(coalesceBoolean(undefined, true), true);
    assert.equal(coalesceBoolean(false, true), false);
    assert.equal(coalesceDays(undefined, 5), 5);
    assert.equal(coalesceDays(null, 5), null);
    assert.equal(coalesceDays(3.9, null), 3);
  });

  it("describes missing exclusive roles without using the raw id as the sentence", () => {
    const err = missingExclusiveRoleError("isIntake", 0);
    assert.equal(err.code, "LIFECYCLE_ROLE_MISSING");
    assert.match(err.message, /Starting status/);
    assert.doesNotMatch(err.message, /isIntake/);
  });

  it("seeds enterprise defaults with the Wave 0 roles", () => {
    const release = createDefaultReleaseLifecycleConfig();
    assert.equal(release.statuses.find((s) => s.key === "draft")?.isIntake, true);
    assert.equal(
      release.statuses.find((s) => s.key === "ready_to_deploy")?.readyMilestone,
      true
    );
    assert.equal(
      release.statuses.find((s) => s.key === "deploying")?.deployingMilestone,
      true
    );
    assert.equal(
      release.statuses.find((s) => s.key === "deployed")?.deployedMilestone,
      true
    );
    assert.equal(
      release.statuses.find((s) => s.key === "cancelled")?.withdrawApprovalsOnEnter,
      true
    );
    assert.equal(
      release.statuses.find((s) => s.key === "cab_approved")?.writesCabScopeSnapshot,
      true
    );
    assert.equal(
      release.statuses.find((s) => s.key === "pending_cab")?.clearsCabScopeSnapshot,
      true
    );

    const blockers = createDefaultBlockerLifecycleConfig();
    assert.equal(blockers.statuses.find((s) => s.key === "open")?.isIntake, true);
    assert.equal(
      blockers.statuses.find((s) => s.key === "resolved")?.unblocksParent,
      true
    );
    assert.equal(
      blockers.statuses.find((s) => s.key === "in_progress")?.staleAlertDays,
      5
    );

    const incidents = createDefaultIncidentLifecycleConfig();
    assert.equal(incidents.statuses.find((s) => s.key === "open")?.isIntake, true);
    assert.equal(
      incidents.statuses.find((s) => s.key === "investigating")?.blocksLinkedRelease,
      true
    );
    assert.equal(
      incidents.statuses.find((s) => s.key === "resolved")?.blocksLinkedRelease,
      false
    );
    assert.equal(
      incidents.statuses.find((s) => s.key === "resolved")?.unblocksParent,
      true
    );
    assert.equal(
      incidents.statuses.find((s) => s.key === "acknowledged")?.label,
      "Acknowledged"
    );

    const risks = createDefaultRiskLifecycleConfig();
    assert.equal(risks.statuses.find((s) => s.key === "identified")?.isIntake, true);
    assert.equal(
      risks.statuses.find((s) => s.key === "escalated")?.escalateTarget,
      true
    );

    const deps = createDefaultDependencyLifecycleConfig();
    assert.equal(deps.statuses.find((s) => s.key === "identified")?.isIntake, true);
    assert.equal(
      deps.statuses.find((s) => s.key === "resolved")?.satisfiesHardGate,
      true
    );
    assert.equal(
      deps.statuses.find((s) => s.key === "removed")?.satisfiesHardGate,
      true
    );
    assert.equal(
      deps.statuses.find((s) => s.key === "closed")?.satisfiesHardGate,
      true
    );
    assert.equal(
      deps.statuses.find((s) => s.key === "resolved")?.autoResolvedOnDeploy,
      true
    );
    assert.equal(deps.statuses.find((s) => s.key === "met"), undefined);

    const approvals = createDefaultApprovalLifecycleConfig();
    assert.equal(approvals.statuses.find((s) => s.key === "pending")?.isIntake, true);
    assert.equal(
      approvals.statuses.find((s) => s.key === "withdrawn")?.isWithdrawn,
      true
    );
    assert.equal(
      approvals.statuses.find((s) => s.key === "approved_with_conditions")
        ?.requiresConditions,
      true
    );
    assert.equal(
      approvals.statuses.find((s) => s.key === "rejected")?.revertsLinkedReleaseOnEnter,
      true
    );
    assert.equal(
      release.statuses.find((s) => s.key === "planning")?.approvalRejectLanding,
      true
    );
  });

  it("lists exclusive-role gaps in plain English for Settings", () => {
    const none = exclusiveRoleIssues(
      [{ key: "a", enabled: true, isIntake: false }],
      ["isIntake"]
    );
    assert.equal(none.length, 1);
    assert.match(none[0]!.message, /Starting status/);
  });

  it("flags a missing met-dependency dest in Settings (AV-04)", () => {
    const deps = createDefaultDependencyLifecycleConfig();
    deps.statuses = deps.statuses.map((s) => ({ ...s, satisfiesHardGate: false }));
    const issues = automationRoleIssues(deps.statuses, ["isIntake", "satisfiesHardGate"]);
    assert.ok(issues.some((i) => i.roleId === "satisfiesHardGate"));
    assert.equal(
      exclusiveRoleIssues(deps.statuses, ["isIntake", "satisfiesHardGate"]).some(
        (i) => i.roleId === "satisfiesHardGate"
      ),
      false,
      "satisfiesHardGate is many — exclusive check must not fire"
    );
  });

  it("fails loudly when an exclusive role is missing (AV-02 class)", () => {
    const risks = createDefaultRiskLifecycleConfig();
    risks.statuses = risks.statuses.map((s) => ({ ...s, escalateTarget: false }));
    const result = resolveExclusiveRole(
      risks.statuses,
      (s) => s.escalateTarget,
      "escalateTarget",
      "AV-02"
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.fault.code, "LIFECYCLE_ROLE_MISSING");
    assert.match(result.fault.message, /Auto-escalate lands here/);
    assert.equal(result.fault.automation, "AV-02");
  });
});
