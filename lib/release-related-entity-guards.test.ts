/**
 * Run: npx tsx --test lib/release-related-entity-guards.test.ts
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import "@/lib/load-db-env-for-tests";
import { prisma } from "@/lib/prisma";
import { createApprovalRow, createReleaseRow } from "@/lib/org-compat";
import {
  cascadeWithdrawApprovalsOnReleaseCancelled,
  guardBlockerCreateWhileDeployingOrLater,
  guardDependencyGraphMutation,
  guardEnvBookingMutationWhileDeploying,
  isReleaseAtOrBeyondDeploying,
  isReleaseAtOrBeyondReady,
  isReleaseCancelled,
  isReleaseDeploying,
} from "@/lib/release-related-entity-guards";

const skipDb = process.env.FIELD_LOCK_WIRING_SKIP_DB === "1";

describe("isReleaseAtOrBeyondReady (VR-36 threshold)", () => {
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
  it("matches Deploying and Cancelled by label or key", () => {
    assert.equal(isReleaseDeploying("Deploying"), true);
    assert.equal(isReleaseDeploying("deploying"), true);
    assert.equal(isReleaseDeploying("Ready to deploy"), false);
    assert.equal(isReleaseCancelled("Cancelled"), true);
    assert.equal(isReleaseCancelled("canceled"), true);
    assert.equal(isReleaseCancelled("Closed"), false);
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
        const n = await cascadeWithdrawApprovalsOnReleaseCancelled(release.id);
        assert.equal(n, 1);
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

after(async () => {
  if (!skipDb) {
    await Promise.race([
      prisma.$disconnect().catch(() => undefined),
      new Promise((r) => setTimeout(r, 5_000)),
    ]);
  }
});
