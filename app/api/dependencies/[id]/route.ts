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
  loadGuardReleaseConfig,
} from "@/lib/release-related-entity-guards";
import { editPolicyDeniedMessage } from "@/lib/edit-policy-user-message";
import { keysWithActualPatchChanges } from "@/lib/patch-changed-keys";

type Params = { params: Promise<{ id: string }> };

async function findDependency(id: string) {
  return (
    (await prisma.releaseDependency.findUnique({
      where: { id },
      include: {
        release: {
          select: {
            id: true,
            releaseCode: true,
            name: true,
            status: true,
            lifecycleConfigVersionId: true,
          },
        },
        dependsOnRelease: { select: { id: true, releaseCode: true, name: true, status: true } },
      },
    })) ??
    (await prisma.releaseDependency.findFirst({
      where: { dependencyCode: id },
      include: {
        release: {
          select: {
            id: true,
            releaseCode: true,
            name: true,
            status: true,
            lifecycleConfigVersionId: true,
          },
        },
        dependsOnRelease: { select: { id: true, releaseCode: true, name: true, status: true } },
      },
    }))
  );
}

function mapDetail(row: NonNullable<Awaited<ReturnType<typeof findDependency>>>) {
  return {
    id: row.id,
    depCode: row.dependencyCode ?? "",
    dependencyType: row.dependencyType ?? "",
    dependencyKind: row.dependencyKind ?? "",
    status: row.status ?? "",
    impactIfBlocked: row.impactIfBlocked ?? "",
    notes: row.notes,
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

  const parsed = patchDependencySchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const proposedKeys = keysWithActualPatchChanges({
    existing: existing as unknown as Record<string, unknown>,
    body: body as unknown as Record<string, unknown>,
    metaKeys: new Set(["overrideReason"]),
  });
  const proposed = new Set(proposedKeys);

  let nextStatusKey: string | undefined;
  // Lifecycle: edit policy + status transitions (config-driven soft gates).
  try {
    const { config } = await loadDependencyLifecycleConfig(user!.id);
    const { mode, denied } = deniedDependencyEditFields(
      config,
      existing.status ?? "Pending",
      proposedKeys
    );
    if (denied.length > 0) {
      return NextResponse.json(
        {
          error: editPolicyDeniedMessage({
            entity: "dependency",
            mode,
            statusLabel: existing.status ?? "Pending",
            deniedFields: denied,
          }),
          code: "EDIT_POLICY_DENIED",
          mode,
          denied,
        },
        { status: 409 }
      );
    }
    if (
      body.status !== undefined &&
      String(body.status) !== (existing.status ?? "")
    ) {
      const transition = validateDependencyTransition({
        config,
        fromStatus: existing.status ?? "Pending",
        toStatus: String(body.status),
        overrideReason: body.overrideReason ?? null,
        facts: {
          notes: body.notes !== undefined ? body.notes : existing.notes,
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
  // Skip when full-form saves only echo unchanged release FKs.
  if (
    (proposed.has("releaseId") && body.releaseId !== undefined) ||
    (proposed.has("dependsOnReleaseId") && body.dependsOnReleaseId !== undefined)
  ) {
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
        const nextFrozen = guardDependencyGraphMutation(
          nextParent.status,
          nextConfig
        );
        if (!nextFrozen.ok) return nextFrozen.response;
      }
    }
  }

  try {
    if (proposed.has("releaseId") || proposed.has("dependsOnReleaseId")) {
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
        ...(body.releaseId !== undefined && proposed.has("releaseId")
          ? { releaseId: body.releaseId }
          : {}),
        ...(body.dependsOnReleaseId !== undefined &&
        proposed.has("dependsOnReleaseId")
          ? { dependsOnReleaseId: body.dependsOnReleaseId }
          : {}),
        ...(body.dependencyType !== undefined && proposed.has("dependencyType")
          ? { dependencyType: body.dependencyType }
          : {}),
        ...(body.dependencyKind !== undefined && proposed.has("dependencyKind")
          ? { dependencyKind: body.dependencyKind }
          : {}),
        ...(body.status !== undefined
          ? {
              status: body.status,
              ...(nextStatusKey ? { statusKey: nextStatusKey } : {}),
            }
          : {}),
        ...(body.impactIfBlocked !== undefined && proposed.has("impactIfBlocked")
          ? { impactIfBlocked: body.impactIfBlocked }
          : {}),
        ...(body.notes !== undefined && proposed.has("notes")
          ? { notes: body.notes }
          : {}),
      },
      include: {
        release: {
          select: {
            id: true,
            releaseCode: true,
            name: true,
            status: true,
            lifecycleConfigVersionId: true,
          },
        },
        dependsOnRelease: { select: { id: true, releaseCode: true, name: true, status: true } },
      },
    });

    return NextResponse.json(mapDetail(row));
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
