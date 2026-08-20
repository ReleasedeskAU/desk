import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { patchDependencySchema } from "@/lib/validation/dependency";
import { jsonError, zodErrorResponse } from "@/lib/api-errors";
import { loadDependencyLifecycleConfig } from "@/lib/dependency-lifecycle-config-db";
import { deniedDependencyEditFields } from "@/lib/dependency-lifecycle-edit-policy";
import {
  resolveDependencyLifecycleStatusRef,
  validateDependencyTransition,
} from "@/lib/dependency-lifecycle-transition";
import {
  guardDependencyGraphMutation,
  guardReleaseFullyLocked,
  loadGuardReleaseConfig,
} from "@/lib/release-related-entity-guards";
import { editPolicyDeniedMessage } from "@/lib/edit-policy-user-message";
import {
  ownerIdForDependencyAckSide,
  type DependencyAckSide,
} from "@/lib/dependency-ack";

type Params = { params: Promise<{ id: string }> };

async function findDependency(id: string) {
  const include = {
    release: {
      select: {
        id: true,
        releaseCode: true,
        name: true,
        status: true,
        lifecycleConfigVersionId: true,
        releaseOwnerId: true,
        releaseOwner: { select: { id: true, name: true, email: true } },
      },
    },
    dependsOnRelease: {
      select: {
        id: true,
        releaseCode: true,
        name: true,
        status: true,
        releaseOwnerId: true,
        releaseOwner: { select: { id: true, name: true, email: true } },
      },
    },
  } as const;
  return (
    (await prisma.releaseDependency.findUnique({
      where: { id },
      include,
    })) ??
    (await prisma.releaseDependency.findFirst({
      where: { dependencyCode: id },
      include,
    }))
  );
}

function mapDetail(row: NonNullable<Awaited<ReturnType<typeof findDependency>>>) {
  return {
    id: row.id,
    depCode: row.dependencyCode ?? "",
    dependencyType: row.dependencyType ?? "",
    status: row.status ?? "",
    impactIfBlocked: row.impactIfBlocked ?? "",
    notes: row.notes,
    sourceAcknowledgedAt: row.sourceAcknowledgedAt,
    sourceAcknowledgedByUserId: row.sourceAcknowledgedByUserId,
    targetAcknowledgedAt: row.targetAcknowledgedAt,
    targetAcknowledgedByUserId: row.targetAcknowledgedByUserId,
    release: row.release,
    dependsOnRelease: row.dependsOnRelease,
  };
}

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row = await findDependency(id);
  if (!row) return NextResponse.json({ error: "Dependency not found" }, { status: 404 });
  return NextResponse.json(mapDetail(row));
}

/**
 * Update allowlisted dependency fields (editor+).
 * Status transitions and edit policy are enforced from the caller's dependency lifecycle config.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findDependency(id);
  if (!existing) return NextResponse.json({ error: "Dependency not found" }, { status: 404 });

  const parentConfig = await loadGuardReleaseConfig(
    user!.id,
    existing.release.lifecycleConfigVersionId
  );
  const cancelledLock = guardReleaseFullyLocked(existing.release.status, parentConfig);
  if (!cancelledLock.ok) return cancelledLock.response;

  const parsed = patchDependencySchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  let nextStatusKey: string | undefined;
  let ackPatch: {
    sourceAcknowledgedAt?: Date;
    sourceAcknowledgedByUserId?: string;
    targetAcknowledgedAt?: Date;
    targetAcknowledgedByUserId?: string;
  } = {};
  try {
    const { config } = await loadDependencyLifecycleConfig(user!.id);
    const proposedKeys = Object.keys(body);
    const { mode, denied } = deniedDependencyEditFields(
      config,
      existing.status ?? "",
      proposedKeys
    );
    if (denied.length > 0) {
      return NextResponse.json(
        {
          error: editPolicyDeniedMessage({
            entity: "dependency",
            mode,
            statusLabel: existing.status ?? "Identified",
            deniedFields: denied,
          }),
          code: "EDIT_POLICY_DENIED",
          mode,
          denied,
        },
        { status: 409 }
      );
    }

    if (body.acknowledgeSide) {
      const directory = await prisma.user.findFirst({
        where: {
          OR: [{ clerkUserId: user!.id }, { email: user!.email }],
        },
        select: { id: true },
      });
      const side = body.acknowledgeSide as DependencyAckSide;
      const ownerId = ownerIdForDependencyAckSide(
        existing.release.releaseOwnerId,
        existing.dependsOnRelease.releaseOwnerId,
        side
      );
      if (!ownerId) {
        return NextResponse.json(
          {
            error:
              side === "source"
                ? "This release needs an owner before that manager can confirm."
                : "The upstream release needs an owner before that manager can confirm.",
          },
          { status: 409 }
        );
      }
      if (!directory || directory.id !== ownerId) {
        return NextResponse.json(
          {
            error:
              "Only the release manager for this side can record that confirmation.",
          },
          { status: 403 }
        );
      }
      const now = new Date();
      ackPatch =
        side === "source"
          ? { sourceAcknowledgedAt: now, sourceAcknowledgedByUserId: directory.id }
          : { targetAcknowledgedAt: now, targetAcknowledgedByUserId: directory.id };
    }

    if (
      body.status !== undefined &&
      String(body.status) !== (existing.status ?? "")
    ) {
      const transition = validateDependencyTransition({
        config,
        fromStatus: existing.status ?? "",
        toStatus: String(body.status),
        overrideReason: body.overrideReason ?? null,
        facts: {
          notes: body.notes !== undefined ? body.notes : existing.notes,
          sourceAcknowledgedAt:
            ackPatch.sourceAcknowledgedAt ?? existing.sourceAcknowledgedAt,
          sourceAcknowledgedByUserId:
            ackPatch.sourceAcknowledgedByUserId ??
            existing.sourceAcknowledgedByUserId,
          targetAcknowledgedAt:
            ackPatch.targetAcknowledgedAt ?? existing.targetAcknowledgedAt,
          targetAcknowledgedByUserId:
            ackPatch.targetAcknowledgedByUserId ??
            existing.targetAcknowledgedByUserId,
        },
      });
      if (!transition.allowed) {
        return NextResponse.json(
          {
            error: transition.reason,
            code: transition.code,
            unmetReasons: transition.unmetReasons,
            transition,
          },
          { status: 422 }
        );
      }
      body.status = transition.canonicalStatus;
      nextStatusKey = resolveDependencyLifecycleStatusRef(
        config,
        transition.canonicalStatus
      )?.key;
    }
  } catch (err) {
    console.error("[dependencies PATCH] lifecycle enforcement failed", {
      dependencyId: existing.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Dependency lifecycle validation is temporarily unavailable" },
      { status: 500 }
    );
  }

  const nextReleaseId = body.releaseId ?? existing.releaseId;
  const nextDependsOnId = body.dependsOnReleaseId ?? existing.dependsOnReleaseId;
  if (nextReleaseId === nextDependsOnId) {
    return NextResponse.json({ error: "A release cannot depend on itself" }, { status: 400 });
  }

  // VR-36: rewiring endpoints is an add/remove of the dependency graph.
  if (body.releaseId !== undefined || body.dependsOnReleaseId !== undefined) {
    const parentStatus = existing.release.status;
    const parentConfig = await loadGuardReleaseConfig(
      user!.id,
      existing.release.lifecycleConfigVersionId
    );
    const frozen = guardDependencyGraphMutation(parentStatus, parentConfig);
    if (!frozen.ok) return frozen.response;
    if (body.releaseId !== undefined && body.releaseId !== existing.releaseId) {
      const nextParent = await prisma.release.findUnique({
        where: { id: body.releaseId },
        select: { status: true, lifecycleConfigVersionId: true },
      });
      if (nextParent) {
        const nextConfig = await loadGuardReleaseConfig(
          user!.id,
          nextParent.lifecycleConfigVersionId
        );
        const nextCancelled = guardReleaseFullyLocked(nextParent.status, nextConfig);
        if (!nextCancelled.ok) return nextCancelled.response;
        const nextFrozen = guardDependencyGraphMutation(
          nextParent.status,
          nextConfig
        );
        if (!nextFrozen.ok) return nextFrozen.response;
      }
    }
  }

  try {
    if (body.releaseId || body.dependsOnReleaseId) {
      const [release, dependsOn] = await Promise.all([
        prisma.release.findUnique({ where: { id: nextReleaseId }, select: { id: true } }),
        prisma.release.findUnique({ where: { id: nextDependsOnId }, select: { id: true } }),
      ]);
      if (!release || !dependsOn) {
        return NextResponse.json({ error: "Release not found" }, { status: 404 });
      }

      const clash = await prisma.releaseDependency.findFirst({
        where: {
          releaseId: nextReleaseId,
          dependsOnReleaseId: nextDependsOnId,
          NOT: { id: existing.id },
        },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json({ error: "This dependency already exists" }, { status: 409 });
      }
    }

    const row = await prisma.releaseDependency.update({
      where: { id: existing.id },
      data: {
        ...(body.releaseId !== undefined ? { releaseId: body.releaseId } : {}),
        ...(body.dependsOnReleaseId !== undefined
          ? { dependsOnReleaseId: body.dependsOnReleaseId }
          : {}),
        ...(body.dependencyType !== undefined ? { dependencyType: body.dependencyType } : {}),
        ...(body.status !== undefined
          ? {
              status: body.status,
              ...(nextStatusKey ? { statusKey: nextStatusKey } : {}),
            }
          : {}),
        ...(body.impactIfBlocked !== undefined ? { impactIfBlocked: body.impactIfBlocked } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...ackPatch,
      },
    });
    const fresh = await findDependency(existing.id);
    if (!fresh) return NextResponse.json({ error: "Dependency not found" }, { status: 404 });
    return NextResponse.json(mapDetail(fresh));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ error: "This dependency already exists" }, { status: 409 });
    }
    return jsonError(err, {
      publicMessage: "Failed to update dependency",
      status: 500,
      logLabel: "api/dependencies/[id] PATCH",
    });
  }
}

/** Delete a dependency (editor+). */
export async function DELETE(_req: Request, { params }: Params) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findDependency(id);
  if (!existing) return NextResponse.json({ error: "Dependency not found" }, { status: 404 });

  const parentConfig = await loadGuardReleaseConfig(
    user!.id,
    existing.release.lifecycleConfigVersionId
  );
  const cancelledLock = guardReleaseFullyLocked(existing.release.status, parentConfig);
  if (!cancelledLock.ok) return cancelledLock.response;
  const frozen = guardDependencyGraphMutation(
    existing.release.status,
    parentConfig
  );
  if (!frozen.ok) return frozen.response;

  try {
    await prisma.releaseDependency.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err, {
      publicMessage: "Failed to delete dependency",
      status: 500,
      logLabel: "api/dependencies/[id] DELETE",
    });
  }
}
