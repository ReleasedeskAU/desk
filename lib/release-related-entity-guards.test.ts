/**
 * Run: npx tsx --test lib/release-related-entity-guards.test.ts
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import "@/lib/load-db-env-for-tests";
import { prisma } from "@/lib/prisma";
import { createApprovalRow, createReleaseRow, createRiskRow } from "@/lib/org-compat";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  cascadeRevertReleaseOnApprovalDecision,
  cascadeWithdrawApprovalsOnReleaseCancelled,
  guardBlockerCreateWhileDeployingOrLater,
  guardDependencyGraphMutation,
  guardEnvBookingMutationWhileDeploying,
  isReleaseAtOrBeyondDeploying,
  isReleaseAtOrBeyondReady,
  isReleaseCancelled,
  isReleaseDeploying,
} from "@/lib/release-related-entity-guards";
import { createDefaultApprovalLifecycleConfig } from "@/lib/approval-lifecycle-config";

const skipDb = process.env.FIELD_LOCK_WIRING_SKIP_DB === "1";

describe("isReleaseAtOrBeyondReady (VR-36 threshold)", () => {
  it("follows the Ready milestone flag, not the ready_to_deploy key", () => {
    const config = createDefaultReleaseLifecycleConfig();
    config.statuses = config.statuses.map((s) => ({
      ...s,
      readyMilestone: s.key === "cab_approved",
    }));
    assert.equal(isReleaseAtOrBeyondReady("CAB Approved", config), true);
    assert.equal(isReleaseAtOrBeyondReady("Pending CAB", config), false);
    assert.equal(isReleaseAtOrBeyondReady("Ready to deploy", config), true);
  });

  it("is false before Ready and true from Ready onward", () => {
    assert.equal(isReleaseAtOrBeyondReady("Draft"), false);
    assert.equal(isReleaseAtOrBeyondReady("CAB Approved"), false);
    assert.equal(isReleaseAtOrBeyondReady("Pending CAB"), false);
    assert.equal(isReleaseAtOrBeyondReady("Ready to deploy"), true);
    assert.equal(isReleaseAtOrBeyondReady("ready_to_deploy"), true);
    assert.equal(isReleaseAtOrBeyondReady("Deploying"), true);
    assert.equal(isReleaseAtOrBeyondReady("Deployed"), true);
    assert.equal(isReleaseAtOrBeyondReady("Closed"), true);
    assert.equal(isReleaseAtOrBeyondReady("Cancelled"), false);
  });
});

describe("guardDependencyGraphMutation (VR-36)", () => {
  it("allows graph edits before Ready", () => {
    assert.equal(guardDependencyGraphMutation("Planning").ok, true);
  });

  it("denies graph edits at Ready and later with VR36 code", async () => {
    const denied = guardDependencyGraphMutation("Ready to deploy");
    assert.equal(denied.ok, false);
    if (denied.ok) return;
    assert.equal(denied.response.status, 409);
    const body = (await denied.response.json()) as { code?: string };
    assert.equal(body.code, "VR36_DEPENDENCY_GRAPH_FROZEN");
  });
});

describe("guardEnvBookingMutationWhileDeploying (§3-06)", () => {
  it("allows booking mutations outside Deploying", () => {
    assert.equal(guardEnvBookingMutationWhileDeploying("Ready to deploy").ok, true);
    assert.equal(guardEnvBookingMutationWhileDeploying("Deployed").ok, true);
  });

  it("denies booking mutations while Deploying", async () => {
    const denied = guardEnvBookingMutationWhileDeploying("Deploying");
    assert.equal(denied.ok, false);
    if (denied.ok) return;
    assert.equal(denied.response.status, 409);
    const body = (await denied.response.json()) as { code?: string };
    assert.equal(body.code, "S306_ENV_BOOKING_LOCKED");
  });
});

describe("guardBlockerCreateWhileDeployingOrLater (VR-35)", () => {
  it("allows blocker create before Deploying", () => {
    assert.equal(isReleaseAtOrBeyondDeploying("Ready to deploy"), false);
    assert.equal(guardBlockerCreateWhileDeployingOrLater("Ready to deploy").ok, true);
    assert.equal(guardBlockerCreateWhileDeployingOrLater("CAB Approved").ok, true);
  });

  it("denies blocker create at Deploying and later", async () => {
    assert.equal(isReleaseAtOrBeyondDeploying("Deploying"), true);
    assert.equal(isReleaseAtOrBeyondDeploying("Deployed"), true);
    assert.equal(isReleaseAtOrBeyondDeploying("Closed"), true);
    const denied = guardBlockerCreateWhileDeployingOrLater("Deploying");
    assert.equal(denied.ok, false);
    if (denied.ok) return;
    assert.equal(denied.response.status, 409);
    const body = (await denied.response.json()) as { code?: string };
    assert.equal(body.code, "VR35_BLOCKER_CREATE_LOCKED");
  });
});

describe("isReleaseDeploying / isReleaseCancelled", () => {
  it("follows the Deploying milestone flag, not the deploying key", () => {
    const config = createDefaultReleaseLifecycleConfig();
    config.statuses = config.statuses.map((s) => ({
      ...s,
      deployingMilestone: s.key === "ready_to_deploy",
    }));
    assert.equal(isReleaseDeploying("Ready to deploy", config), true);
    assert.equal(isReleaseDeploying("Deploying", config), false);
  });

  it("matches Deploying and Cancelled by label or key", () => {
    assert.equal(isReleaseDeploying("Deploying"), true);
    assert.equal(isReleaseDeploying("deploying"), true);
    assert.equal(isReleaseDeploying("Ready to deploy"), false);
    assert.equal(isReleaseCancelled("Cancelled"), true);
    assert.equal(isReleaseCancelled("canceled"), true);
    assert.equal(isReleaseCancelled("Closed"), false);
  });

  it("follows Withdraw open approvals, not the Cancelled key (CASC-13)", () => {
    const config = createDefaultReleaseLifecycleConfig();
    config.statuses = config.statuses.map((s) => ({
      ...s,
      withdrawApprovalsOnEnter: s.key === "rejected",
    }));
    assert.equal(isReleaseCancelled("Rejected", config), true);
    assert.equal(isReleaseCancelled("Cancelled", config), false);
  });
});

describe("cascadeWithdrawApprovalsOnReleaseCancelled (CASC-13)", () => {
  it(
    "withdraws Pending/Deferred approvals and leaves Approved alone",
    { skip: skipDb },
    async () => {
      const dept = await prisma.department.findFirst({ select: { id: true } });
      const approver = await prisma.user.findFirst({ select: { id: true } });
      assert.ok(dept && approver, "need department + user rows");

      const code = `CASC-${Date.now().toString(36).toUpperCase()}`;
      const release = await createReleaseRow({
        releaseCode: code,
        name: "CASC-13 wiring",
        programProject: "N/A",
        owner: "Test",
        status: "Cancelled",
        releaseDate: new Date("2026-12-01"),
        priority: "P3 - Medium",
        impact: "Medium",
        departmentId: dept.id,
      });

      const pending = await createApprovalRow({
        approvalCode: `${code}-P`,
        releaseId: release.id,
        approvalType: "CAB",
        approverId: approver.id,
        submittedDate: new Date(),
        decision: "Pending",
      });
      const approved = await createApprovalRow({
        approvalCode: `${code}-A`,
        releaseId: release.id,
        approvalType: "CAB",
        approverId: approver.id,
        submittedDate: new Date(),
        decision: "Approved",
        decisionDate: new Date(),
      });

      try {
        const n = await cascadeWithdrawApprovalsOnReleaseCancelled(
          release.id,
          "status_transition_audit_scope"
        );
        assert.equal(n.count, 1);
        const afterPending = await prisma.approval.findUniqueOrThrow({
          where: { id: pending.id },
        });
        const afterApproved = await prisma.approval.findUniqueOrThrow({
          where: { id: approved.id },
        });
        assert.equal(afterPending.decision, "Withdrawn");
        assert.equal(afterApproved.decision, "Approved");
      } finally {
        await prisma.approval.deleteMany({ where: { releaseId: release.id } });
        await prisma.release.delete({ where: { id: release.id } }).catch(() => undefined);
      }
    }
  );
});

describe("cascadeRevertReleaseOnApprovalDecision", () => {
  it("follows the approval-reject landing role, not the Planning key", () => {
    const releaseConfig = createDefaultReleaseLifecycleConfig();
    assert.equal(
      releaseConfig.statuses.find((s) => s.approvalRejectLanding)?.label,
      "Planning"
    );
    releaseConfig.statuses = releaseConfig.statuses.map((s) => ({
      ...s,
      approvalRejectLanding: s.key === "draft",
    }));
    assert.equal(
      releaseConfig.statuses.find((s) => s.approvalRejectLanding)?.label,
      "Draft"
    );
  });

  it(
    "moves the linked release to the landing status when the decision reverts it",
    { skip: skipDb },
    async () => {
      const dept = await prisma.department.findFirst({ select: { id: true } });
      assert.ok(dept, "need a department row");

      const code = `REVERT-${Date.now().toString(36).toUpperCase()}`;
      const release = await createReleaseRow({
        releaseCode: code,
        name: "approval reject revert",
        programProject: "N/A",
        owner: "Test",
        status: "Testing",
        releaseDate: new Date("2026-12-01"),
        priority: "P3 - Medium",
        impact: "Medium",
        departmentId: dept.id,
      });

      try {
        const approvalConfig = createDefaultApprovalLifecycleConfig();
        const n = await cascadeRevertReleaseOnApprovalDecision(
          release.id,
          "status_transition_audit_scope",
          approvalConfig,
          "Rejected"
        );
        assert.equal(n.count, 1);
        const after = await prisma.release.findUniqueOrThrow({
          where: { id: release.id },
          select: { status: true },
        });
        assert.equal(after.status, "Planning");

        const skipped = await cascadeRevertReleaseOnApprovalDecision(
          release.id,
          "status_transition_audit_scope",
          approvalConfig,
          "Approved"
        );
        assert.equal(skipped.count, 0);
      } finally {
        await prisma.release.delete({ where: { id: release.id } }).catch(() => undefined);
      }
    }
  );
});

describe("org-compat live-Neon create writes statusKey (Wave 4 gap)", () => {
  it(
    "persists statusKey on Release and Risk insert, not only on later PATCH",
    { skip: skipDb },
    async () => {
      const dept = await prisma.department.findFirst({ select: { id: true } });
      assert.ok(dept, "need a department row");

      const code = `SK-${Date.now().toString(36).toUpperCase()}`;
      const release = await createReleaseRow({
        releaseCode: code,
        name: "statusKey create path",
        programProject: "N/A",
        owner: "Test",
        status: "Draft",
        statusKey: "draft",
        releaseDate: new Date("2026-12-01"),
        priority: "P3 - Medium",
        impact: "Medium",
        departmentId: dept.id,
      });
      let riskId: string | undefined;
      try {
        const storedRelease = await prisma.release.findUniqueOrThrow({
          where: { id: release.id },
          select: { status: true, statusKey: true },
        });
        assert.equal(storedRelease.status, "Draft");
        assert.equal(storedRelease.statusKey, "draft");

        const risk = await createRiskRow({
          riskCode: `${code}-R`,
          releaseId: release.id,
          category: "Technical",
          description: "statusKey create path",
          likelihood: 2,
          impact: 2,
          status: "Identified",
          statusKey: "identified",
        });
        riskId = risk.id;
        const storedRisk = await prisma.risk.findUniqueOrThrow({
          where: { id: risk.id },
          select: { status: true, statusKey: true },
        });
        assert.equal(storedRisk.status, "Identified");
        assert.equal(storedRisk.statusKey, "identified");
      } finally {
        if (riskId) {
          await prisma.risk.delete({ where: { id: riskId } }).catch(() => undefined);
        }
        await prisma.release.delete({ where: { id: release.id } }).catch(() => undefined);
      }
    }
  );
});

after(async () => {
  if (!skipDb) {
    await Promise.race([
      prisma.$disconnect().catch(() => undefined),
      new Promise((r) => setTimeout(r, 5_000)),
    ]);
  }
});
