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
  listLegalNextStatuses,
  resolveLifecycleStatusRef,
} from "@/lib/release-lifecycle-transition";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, error } = await requireRole("readonly");
  if (error) return error;

  const release = await prisma.release.findFirst({
    where: { OR: [{ id }, { releaseCode: id }] },
  });
  if (!release) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const resolved = await resolveLifecycleConfigForRelease(
      user!.id,
      release.lifecycleConfigVersionId
    );
    const gateFacts = await loadReleaseLifecycleGateFacts({
      id: release.id,
      releaseCode: release.releaseCode,
      status: release.status,
      owner: release.owner,
      releaseSize: release.releaseSize,
      priority: release.priority,
      releaseDate: release.releaseDate,
      rollbackPlan: release.rollbackPlan,
      goLiveChecklistPercent: release.goLiveChecklistPercent,
      lifecycleConfigVersionId: release.lifecycleConfigVersionId,
      devSignoff: release.devSignoff,
      testSignoff: release.testSignoff,
      uatSignoff: release.uatSignoff,
      securityClearance: release.securityClearance,
    });
    const previousStatus = await loadPreviousReleaseStatus(
      release.id,
      release.status
    );
    const current = resolveLifecycleStatusRef(resolved.config, release.status);
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
      unknownStatus: current == null,
      configPin: resolved.configPin,
      versionId: resolved.versionId,
      previousStatus,
      next,
      stepper,
      evidence: {
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
