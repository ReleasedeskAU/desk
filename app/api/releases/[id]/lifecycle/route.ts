/**
 * GET /api/releases/[id]/lifecycle
 *
 * Returns the pinned/latest config view for the status picker and stepper:
 * legal next statuses with gate feedback, plus the mainline/interrupt model.
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { resolveLifecycleConfigForRelease } from "@/lib/release-lifecycle-config-db";
import {
  loadPreviousReleaseStatus,
  loadReleaseLifecycleGateFacts,
} from "@/lib/release-lifecycle-status-patch";
import {
  buildLifecycleStepperModel,
  emptyLifecycleGateFacts,
  listLegalNextStatuses,
  resolveLifecycleStatusRef,
} from "@/lib/release-lifecycle-transition";
import {
  isReleaseAtOrBeyondDeploying,
  isReleaseAtOrBeyondReady,
} from "@/lib/release-related-entity-guards";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, error } = await requireRole("readonly");
  if (error) return error;

  const preview = new URL(req.url).searchParams.get("preview") === "1";

  const release = await prisma.release.findFirst({
    where: { OR: [{ id }, { releaseCode: id }] },
  });
  if (!release) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const resolved = await resolveLifecycleConfigForRelease(
      user!.id,
      release.lifecycleConfigVersionId
    );
    const previousStatus = await loadPreviousReleaseStatus(
      release.id,
      release.status
    );
    const current = resolveLifecycleStatusRef(resolved.config, release.status);

    // Preview skips other-entity lifecycle configs (blocker/incident/…) so the
    // Edit Release dropdown can list next steps without a 15s+ gate-fact storm.
    // PATCH still evaluates full facts. `preview` is an allowlisted flag only.
    let gateFacts;
    if (preview) {
      const applicationCount = await prisma.releaseApplication.count({
        where: { releaseId: release.id },
      });
      gateFacts = emptyLifecycleGateFacts({
        owner: release.owner,
        releaseSize: release.releaseSize,
        priority: release.priority,
        name: release.name,
        applicationCount,
        startDate: release.startDate,
        releaseDate: release.releaseDate,
        rollbackPlan: release.rollbackPlan,
        notes: release.notes,
        goLiveChecklistPercent: release.goLiveChecklistPercent,
        changeFreezeActive: Boolean(release.changeFreeze?.trim()),
        pirComplete: Boolean(release.postImplementationReviewCompleted),
        scopeDescription: release.scopeDescription,
        fields: {
          owner: release.owner,
          releaseSize: release.releaseSize,
          priority: release.priority,
          releaseDate: release.releaseDate,
          rollbackPlan: release.rollbackPlan,
        },
      });
    } else {
      gateFacts = await loadReleaseLifecycleGateFacts(
        {
          id: release.id,
          releaseCode: release.releaseCode,
          status: release.status,
          name: release.name,
          owner: release.owner,
          releaseSize: release.releaseSize,
          priority: release.priority,
          startDate: release.startDate,
          releaseDate: release.releaseDate,
          rollbackPlan: release.rollbackPlan,
          notes: release.notes,
          changeFreeze: release.changeFreeze,
          goLiveChecklistPercent: release.goLiveChecklistPercent,
          lifecycleConfigVersionId: release.lifecycleConfigVersionId,
          devSignoff: release.devSignoff,
          testSignoff: release.testSignoff,
          uatSignoff: release.uatSignoff,
          securityClearance: release.securityClearance,
          dressRehearsal: release.dressRehearsal,
          opsSignoff: release.opsSignoff,
          businessSignoff: release.businessSignoff,
          scopeDescription: release.scopeDescription,
          postImplementationReviewCompleted:
            release.postImplementationReviewCompleted,
          cabScopeSnapshot: release.cabScopeSnapshot,
        },
        user!.id
      );
    }
    const next = listLegalNextStatuses({
      config: resolved.config,
      fromStatus: release.status,
      previousStatus,
      gateFacts,
    });
    const stepper = buildLifecycleStepperModel({
      config: resolved.config,
      currentStatus: release.status,
    });

    return NextResponse.json({
      releaseId: release.id,
      releaseCode: release.releaseCode,
      status: release.status,
      currentKey: current?.key ?? null,
      currentLabel: current?.label ?? release.status,
      currentKind: current?.kind ?? null,
      currentEnabled: current?.enabled ?? false,
      /** VR-36 — dependency graph add/remove frozen at Ready and later. */
      dependencyGraphFrozen: isReleaseAtOrBeyondReady(release.status, resolved.config),
      /** VR-35 — new blockers locked once Deploying or later. */
      blockerCreateLocked: isReleaseAtOrBeyondDeploying(release.status, resolved.config),
      unknownStatus: current == null,
      configPin: resolved.configPin,
      versionId: resolved.versionId,
      previousStatus,
      next,
      stepper,
      evidence: preview
        ? {
            openBlockerCount: gateFacts.openBlockerCount,
            hasUatBooking: gateFacts.hasUatBooking,
            hasDeployBooking: gateFacts.hasDeployBooking,
            hardDependenciesMet: gateFacts.hardDependenciesMet,
            signoffsComplete: gateFacts.signoffsComplete,
            goLiveChecklistPercent: gateFacts.goLiveChecklistPercent,
            preview: true,
          }
        : {
            openBlockerCount: gateFacts.openBlockerCount,
            hasUatBooking: gateFacts.hasUatBooking,
            hasDeployBooking: gateFacts.hasDeployBooking,
            hardDependenciesMet: gateFacts.hardDependenciesMet,
            signoffsComplete: gateFacts.signoffsComplete,
            goLiveChecklistPercent: gateFacts.goLiveChecklistPercent,
          },
    });
  } catch (err) {
    console.error("[releases lifecycle GET] failed", {
      releaseId: release.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Lifecycle view is temporarily unavailable" },
      { status: 500 }
    );
  }
}
