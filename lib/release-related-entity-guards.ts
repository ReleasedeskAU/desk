/**
 * Cross-entity guards driven by parent Release status (Related Entity Lock Rules).
 *
 * - VR-36: freeze dependency graph add/remove once Release ≥ Ready
 * - §3-06: lock environment booking mutations while Release is Deploying
 * - CASC-13: withdraw open Approvals when Release becomes Cancelled
 * - Approval rejection: revert the linked release to the approvalRejectLanding status
 *
 * These are separate from per-entity lifecycle terminal locks and from Agent 1
 * field locks — do not combine those systems here.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadApprovalLifecycleConfig } from "@/lib/approval-lifecycle-config-db";
import { approvalDecisionRevertsLinkedRelease } from "@/lib/approval-lifecycle-transition";
import type { ApprovalLifecycleConfig } from "@/lib/approval-lifecycle-config";
import {
  enabledStatusMatchValues,
  reportLifecycleRoleFault,
  resolveExclusiveRole,
} from "@/lib/lifecycle-status-roles";
import type { CascadeHookResult } from "@/lib/lifecycle-event-hooks";
import { resolveLifecycleConfigForRelease } from "@/lib/release-lifecycle-config-db";
import {
  createDefaultReleaseLifecycleConfig,
  type ReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config";
import { resolveLifecycleStatusRef } from "@/lib/release-lifecycle-transition";

/**
 * Live or pinned release graph for VR-35 / VR-36 / §3-06.
 * @param clerkUserId - Caller whose settings to read
 * @param lifecycleConfigVersionId - Pinned version on the release row
 */
export async function loadGuardReleaseConfig(
  clerkUserId: string,
  lifecycleConfigVersionId?: string | null
): Promise<ReleaseLifecycleConfig> {
  const { config } = await resolveLifecycleConfigForRelease(
    clerkUserId,
    lifecycleConfigVersionId
  );
  return config;
}

export type RelatedEntityGuardDenial = {
  ok: false;
  response: NextResponse;
};

export type RelatedEntityGuardOk = { ok: true };

/**
 * True when `status` is the milestone or later on the main path.
 * Later = mainline with sortOrder ≥ milestone, or the happy-path terminal
 * (Closed). Abort terminals that withdraw approvals (Cancelled) are excluded.
 * @param status - Release.status label or key
 * @param config - Live or pinned release lifecycle config
 * @param flag - Exclusive milestone role
 */
export function isAtOrBeyondMilestone(
  status: string,
  config: ReleaseLifecycleConfig,
  flag: "readyMilestone" | "deployingMilestone" | "deployedMilestone"
): boolean {
  const milestone = config.statuses.find((s) => s.enabled && s[flag]);
  const resolved = resolveLifecycleStatusRef(config, status);
  if (!milestone || !resolved?.enabled) return false;
  if (resolved.key === milestone.key) return true;
  if (resolved.sortOrder < milestone.sortOrder) return false;
  if (resolved.kind === "mainline") return true;
  // Closed is kind=terminal after Deployed; Cancelled is an abort.
  if (resolved.kind === "terminal" && !resolved.withdrawApprovalsOnEnter) {
    return true;
  }
  return false;
}

/**
 * Resolve whether a release status is at or beyond the Ready milestone (VR-36).
 * @param status - Release.status label or key
 * @param config - Optional lifecycle config (defaults to enterprise default)
 */
export function isReleaseAtOrBeyondReady(
  status: string,
  config: ReleaseLifecycleConfig = createDefaultReleaseLifecycleConfig()
): boolean {
  return isAtOrBeyondMilestone(status, config, "readyMilestone");
}

/**
 * True when the release is on the Deploying milestone (§3-06 booking lock).
 * Bookings unlock after Deploying — Deployed/Closed are not locked.
 * @param status - Release.status label or key
 * @param config - Optional lifecycle config
 */
export function isReleaseDeploying(
  status: string,
  config: ReleaseLifecycleConfig = createDefaultReleaseLifecycleConfig()
): boolean {
  const resolved = resolveLifecycleStatusRef(config, status);
  return Boolean(resolved?.enabled && resolved.deployingMilestone);
}

/**
 * True when the release is at or beyond the Deploying milestone (VR-35).
 * @param status - Release.status label or key
 * @param config - Optional lifecycle config
 */
export function isReleaseAtOrBeyondDeploying(
  status: string,
  config: ReleaseLifecycleConfig = createDefaultReleaseLifecycleConfig()
): boolean {
  return isAtOrBeyondMilestone(status, config, "deployingMilestone");
}

/**
 * VR-35 — deny creating a new Blocker once the parent release is Deploying or later.
 * @param releaseStatus - Parent release status
 */
export function guardBlockerCreateWhileDeployingOrLater(
  releaseStatus: string,
  config: ReleaseLifecycleConfig = createDefaultReleaseLifecycleConfig()
): RelatedEntityGuardOk | RelatedEntityGuardDenial {
  if (!isReleaseAtOrBeyondDeploying(releaseStatus, config)) return { ok: true };
  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          "Blockers can’t be created now. This release is Deploying or further along. Resolve issues through the existing deploy process, or move the release back earlier if a new blocker must be raised.",
        code: "VR35_BLOCKER_CREATE_LOCKED",
      },
      { status: 409 }
    ),
  };
}

/**
 * True when entering this status should withdraw open approvals (CASC-13).
 * @param status - Release.status label or key
 * @param config - Live or pinned release lifecycle config
 */
export function isReleaseCancelled(
  status: string,
  config: ReleaseLifecycleConfig = createDefaultReleaseLifecycleConfig()
): boolean {
  const resolved = resolveLifecycleStatusRef(config, status);
  if (resolved) return resolved.enabled && resolved.withdrawApprovalsOnEnter;
  return /^cancell?ed$/i.test(status.trim());
}

/**
 * VR-36 — deny dependency create / delete / endpoint rewiring when parent ≥ Ready.
 * @param releaseStatus - Parent release status
 * @returns Guard result with a 409 response when frozen
 */
export function guardDependencyGraphMutation(
  releaseStatus: string,
  config: ReleaseLifecycleConfig = createDefaultReleaseLifecycleConfig()
): RelatedEntityGuardOk | RelatedEntityGuardDenial {
  if (!isReleaseAtOrBeyondReady(releaseStatus, config)) return { ok: true };
  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          "Dependencies can’t be changed now. This release is Ready to deploy or further along, so the dependency list is locked. Move the release back earlier in the workflow if dependencies must change.",
        code: "VR36_DEPENDENCY_GRAPH_FROZEN",
      },
      { status: 409 }
    ),
  };
}

/**
 * §3-06 — deny env booking create/update/delete while parent is Deploying.
 * @param releaseStatus - Linked (or target) release status
 */
export function guardEnvBookingMutationWhileDeploying(
  releaseStatus: string,
  config: ReleaseLifecycleConfig = createDefaultReleaseLifecycleConfig()
): RelatedEntityGuardOk | RelatedEntityGuardDenial {
  if (!isReleaseDeploying(releaseStatus, config)) return { ok: true };
  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          "Environment bookings can’t be changed while this release is Deploying. Wait until Deploying finishes, or change status only if your process allows.",
        code: "S306_ENV_BOOKING_LOCKED",
      },
      { status: 409 }
    ),
  };
}

/**
 * CASC-13 — set open Approvals on a release to the withdrawn status.
 * Leaves already-terminal decisions unchanged.
 *
 * @param releaseId - Release primary key
 * @param clerkUserId - Caller whose approval config to read
 */
export async function cascadeWithdrawApprovalsOnReleaseCancelled(
  releaseId: string,
  clerkUserId: string
): Promise<CascadeHookResult> {
  const { config } = await loadApprovalLifecycleConfig(clerkUserId);
  const withdrawn = resolveExclusiveRole(
    config.statuses,
    (s) => s.isWithdrawn,
    "isWithdrawn",
    "CASC-13"
  );
  if (!withdrawn.ok) {
    reportLifecycleRoleFault(withdrawn.fault);
    return { count: 0, roleFault: withdrawn.fault };
  }
  const openValues = enabledStatusMatchValues(
    config.statuses,
    (s) => !s.terminal
  );
  // Security: only touch non-terminal decisions; never rewrite Approved/Rejected history.
  const open = await prisma.approval.findMany({
    where: {
      releaseId,
      decision: { in: openValues.length > 0 ? openValues : ["__lifecycle_no_match__"] },
    },
    select: { id: true, comments: true },
  });
  if (open.length === 0) return { count: 0 };

  const now = new Date();
  const cascNote = "CASC-13: withdrawn because parent release was cancelled";
  await prisma.$transaction(
    open.map((row) =>
      prisma.approval.update({
        where: { id: row.id },
        data: {
          decision: withdrawn.status.label,
          decisionDate: now,
          ...(row.comments?.trim() ? {} : { comments: cascNote }),
        },
      })
    )
  );
  return { count: open.length };
}

/**
 * When an approval decision enters a status flagged “revert the linked release”,
 * move the parent release to the exclusive approvalRejectLanding status.
 * Landing is resolved from the release graph — never a hardcoded “Planning” write.
 *
 * @param releaseId - Parent release primary key
 * @param clerkUserId - Caller whose release config (pinned on the row) to read
 * @param approvalConfig - Live approval graph used to confirm the decision role
 * @param nextDecision - Canonical decision label just written
 */
export async function cascadeRevertReleaseOnApprovalDecision(
  releaseId: string,
  clerkUserId: string,
  approvalConfig: ApprovalLifecycleConfig,
  nextDecision: string
): Promise<CascadeHookResult> {
  if (!approvalDecisionRevertsLinkedRelease(approvalConfig, nextDecision)) {
    return { count: 0 };
  }
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { id: true, status: true, lifecycleConfigVersionId: true },
  });
  if (!release) return { count: 0 };

  const releaseConfig = await loadGuardReleaseConfig(
    clerkUserId,
    release.lifecycleConfigVersionId
  );
  const landing = resolveExclusiveRole(
    releaseConfig.statuses,
    (s) => s.approvalRejectLanding,
    "approvalRejectLanding",
    "CASC-APPROVAL-REVERT"
  );
  if (!landing.ok) {
    reportLifecycleRoleFault(landing.fault);
    return { count: 0, roleFault: landing.fault };
  }

  const current = resolveLifecycleStatusRef(releaseConfig, release.status);
  if (current?.key === landing.status.key) return { count: 0 };

  await prisma.release.update({
    where: { id: release.id },
    data: {
      status: landing.status.label,
      statusKey: landing.status.key,
    },
  });
  return { count: 1 };
}
