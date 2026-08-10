import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import {
  auditActorName,
  summarizeIdListChange,
  summarizeReleaseFieldEdits,
} from "@/lib/release-audit";
import { normalizeProgramProject } from "@/lib/release-id";
import { deniedReleaseEditFields } from "@/lib/release-lifecycle-edit-policy";
import { resolveLifecycleConfigForRelease } from "@/lib/release-lifecycle-config-db";
import { enforceReleaseStatusChange } from "@/lib/release-lifecycle-status-patch";
import { loadSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config-db";
import { enforceSignoffFieldChanges } from "@/lib/signoff-lifecycle-enforce";
import { SIGNOFF_RELEASE_FIELDS } from "@/lib/signoff-lifecycle-config";

const releaseInclude = {
  department: true,
  releaseOwner: { select: { id: true, userId: true, name: true, email: true, role: true } },
  stakeholders: { include: { user: { select: { id: true, userId: true, name: true, email: true, role: true } } } },
  applications: { include: { application: { include: { department: true } } } },
  dependsOn: { include: { dependsOnRelease: true } },
  dependedBy: { include: { release: true } },
  bookings: { include: { application: true, environment: true } },
  auditEvents: { orderBy: { createdAt: "desc" as const }, take: 100 },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("readonly");
  if (error) return error;

  // Accept both UUID primary key and releaseCode (e.g. REL-0002)
  const row = await prisma.release.findFirst({
    where: { OR: [{ id }, { releaseCode: id }] },
    include: releaseInclude,
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function optionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function optionalFloat(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const body = await req.json();
  // Resolve actual record — accept UUID or releaseCode
  const existing = await prisma.release.findFirst({ where: { OR: [{ id }, { releaseCode: id }] } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const realId = existing.id;

  // Editable? column — deny non-status field writes based on current status.
  try {
    const { config } = await resolveLifecycleConfigForRelease(
      user!.id,
      existing.lifecycleConfigVersionId
    );
    const proposedKeys = Object.keys(body).filter((key) => body[key] !== undefined);
    const { mode, denied } = deniedReleaseEditFields(
      config,
      existing.status,
      proposedKeys
    );
    if (denied.length > 0) {
      return NextResponse.json(
        {
          error: `This release is ${mode.replaceAll("_", "-")} in status "${existing.status}". Cannot change: ${denied.join(", ")}`,
          code: "EDIT_POLICY_DENIED",
          mode,
          denied,
        },
        { status: 409 }
      );
    }
  } catch (err) {
    console.error("[releases PATCH] edit policy resolve failed", {
      releaseId: realId,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Release edit policy is temporarily unavailable" },
      { status: 500 }
    );
  }

  const data: Record<string, unknown> = {};
  for (const key of ["name", "owner", "priority", "impact", "decision", "departmentId", "releaseCode"]) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  if (body.programProject !== undefined) {
    data.programProject = normalizeProgramProject(body.programProject) ?? "N/A";
  }

  // Sign-off checklist fields — config-driven transitions + immutability.
  const signoffKeysInBody = SIGNOFF_RELEASE_FIELDS.filter((key) => body[key] !== undefined);
  if (signoffKeysInBody.length > 0) {
    try {
      const { config: signoffConfig } = await loadSignoffLifecycleConfig(user!.id);
      const signoffResult = enforceSignoffFieldChanges({
        config: signoffConfig,
        existing: {
          devSignoff: existing.devSignoff,
          testSignoff: existing.testSignoff,
          uatSignoff: existing.uatSignoff,
          securityClearance: existing.securityClearance,
          dressRehearsal: existing.dressRehearsal,
          trainingStatus: existing.trainingStatus,
          supportBriefed: existing.supportBriefed,
        },
        body,
      });
      if (!signoffResult.ok) {
        return NextResponse.json(signoffResult.body, {
          status: signoffResult.httpStatus,
        });
      }
      for (const [key, value] of Object.entries(signoffResult.canonical)) {
        data[key] = value;
      }
    } catch (err) {
      console.error("[releases PATCH] sign-off lifecycle enforcement failed", {
        releaseId: realId,
        message: err instanceof Error ? err.message : "unknown",
      });
      return NextResponse.json(
        { error: "Sign-off lifecycle validation is temporarily unavailable" },
        { status: 500 }
      );
    }
  }

  // Status changes go through lifecycle enforcement (pinned or latest-unpinned config).
  let statusOverrideAudit: string | null = null;
  if (body.status !== undefined) {
    const requestedStatus = String(body.status);
    if (requestedStatus !== existing.status) {
      let enforcement;
      try {
        enforcement = await enforceReleaseStatusChange({
          clerkUserId: user!.id,
          release: {
            id: existing.id,
            releaseCode: existing.releaseCode,
            status: existing.status,
            owner: existing.owner,
            releaseSize: existing.releaseSize,
            priority: existing.priority,
            releaseDate: existing.releaseDate,
            rollbackPlan: existing.rollbackPlan,
            notes: existing.notes,
            goLiveChecklistPercent: existing.goLiveChecklistPercent,
            lifecycleConfigVersionId: existing.lifecycleConfigVersionId,
            devSignoff: existing.devSignoff,
            testSignoff: existing.testSignoff,
            uatSignoff: existing.uatSignoff,
            securityClearance: existing.securityClearance,
          },
          requestedStatus,
          overrideReason:
            typeof body.overrideReason === "string" ? body.overrideReason : null,
          previousStatusHint:
            typeof body.previousStatus === "string" ? body.previousStatus : null,
        });
      } catch (err) {
        console.error("[releases PATCH] lifecycle enforcement failed", {
          releaseId: realId,
          message: err instanceof Error ? err.message : "unknown",
        });
        return NextResponse.json(
          { error: "Release status validation is temporarily unavailable" },
          { status: 500 }
        );
      }
      if (!enforcement.ok) {
        return NextResponse.json(enforcement.body, {
          status: enforcement.httpStatus,
        });
      }
      data.status = enforcement.canonicalStatus;
      if (enforcement.result.overridden) {
        statusOverrideAudit = `overrideReason=${enforcement.result.overrideReason}; unmet=${enforcement.result.unmetReasons.join("|")}`;
      }
    }
  }

  for (const key of [
    "notes",
    "dependencies",
    "releaseSize",
    "testEnvRequired",
    "uatEnvRequired",
    "conflictId",
    "blockers",
    "vendorMaintenance",
    "changeFreeze",
    "regulatory",
    "approvalStatus",
    "rollbackPlan",
    "deploymentWindow",
  ] as const) {
    const v = optionalString(body[key]);
    if (v !== undefined) data[key] = v;
  }

  if (body.conflictFlag !== undefined) data.conflictFlag = Boolean(body.conflictFlag);
  if (body.releaseOwnerId !== undefined) data.releaseOwnerId = optionalString(body.releaseOwnerId);

  for (const key of ["releaseDate", "cabDate", "startDate"] as const) {
    const v = optionalDate(body[key]);
    if (v !== undefined) data[key] = v;
  }
  for (const key of ["readinessPercent", "goLiveChecklistPercent"] as const) {
    const v = optionalFloat(body[key]);
    if (v !== undefined) data[key] = v;
  }

  // Collect audit fragments before mutating so "before" state is accurate.
  const auditParts: string[] = [];
  const fieldDetail = summarizeReleaseFieldEdits(
    existing as unknown as Record<string, unknown>,
    data
  );
  if (fieldDetail) auditParts.push(fieldDetail);

  await prisma.release.update({ where: { id: realId }, data });

  if (body.applicationIds) {
    const beforeApps = await prisma.releaseApplication.findMany({
      where: { releaseId: realId },
      select: { applicationId: true },
    });
    const appChange = summarizeIdListChange(
      "Applications",
      beforeApps.map((a) => a.applicationId),
      body.applicationIds as string[]
    );
    if (appChange) auditParts.push(appChange);

    await prisma.releaseApplication.deleteMany({ where: { releaseId: realId } });
    if (body.applicationIds.length) {
      await prisma.releaseApplication.createMany({
        data: body.applicationIds.map((applicationId: string) => ({ releaseId: realId, applicationId })),
      });
    }
  }

  if (body.dependsOnReleaseIds) {
    const dependsOnReleaseIds = body.dependsOnReleaseIds as string[];
    const beforeDeps = await prisma.releaseDependency.findMany({
      where: { releaseId: realId, dependencyCode: null },
      select: { dependsOnReleaseId: true },
    });
    const depChange = summarizeIdListChange(
      "Depends On",
      beforeDeps.map((d) => d.dependsOnReleaseId),
      dependsOnReleaseIds
    );
    if (depChange) auditParts.push(depChange);

    // Preserve tracked dependencies (DEP-*) — only sync lightweight release-form links.
    await prisma.releaseDependency.deleteMany({
      where: {
        releaseId: realId,
        dependencyCode: null,
        ...(dependsOnReleaseIds.length
          ? { dependsOnReleaseId: { notIn: dependsOnReleaseIds } }
          : {}),
      },
    });
    for (const dependsOnReleaseId of dependsOnReleaseIds) {
      const existingDep = await prisma.releaseDependency.findUnique({
        where: {
          releaseId_dependsOnReleaseId: { releaseId: realId, dependsOnReleaseId },
        },
        select: { id: true },
      });
      if (!existingDep) {
        await prisma.releaseDependency.create({
          data: { releaseId: realId, dependsOnReleaseId },
        });
      }
    }
  }

  if (body.stakeholderIds) {
    const beforeStakeholders = await prisma.releaseStakeholder.findMany({
      where: { releaseId: realId },
      select: { userId: true },
    });
    const stakeholderChange = summarizeIdListChange(
      "Stakeholders",
      beforeStakeholders.map((s) => s.userId),
      body.stakeholderIds as string[]
    );
    if (stakeholderChange) auditParts.push(stakeholderChange);

    await prisma.releaseStakeholder.deleteMany({ where: { releaseId: realId } });
    if (body.stakeholderIds.length) {
      await prisma.releaseStakeholder.createMany({
        data: body.stakeholderIds.map((userId: string) => ({ releaseId: realId, userId })),
      });
    }
  }

  // Every edit is recorded with who made it — status-only patches keep a clearer action label.
  if (auditParts.length) {
    const statusOnly =
      Object.keys(data).length === 1 &&
      data.status !== undefined &&
      String(data.status) !== existing.status &&
      !body.applicationIds &&
      !body.dependsOnReleaseIds &&
      !body.stakeholderIds;

    const statusDetail = statusOnly
      ? `Status changed to ${String(data.status)}${
          statusOverrideAudit ? ` (${statusOverrideAudit})` : ""
        }`
      : [
          ...auditParts,
          ...(statusOverrideAudit
            ? [`Status override: ${statusOverrideAudit}`]
            : []),
        ].join(" · ");

    await prisma.releaseAuditEvent.create({
      data: {
        releaseId: realId,
        action: statusOnly ? "status_change" : "edit",
        actor: auditActorName(user!),
        detail: statusDetail,
      },
    });
  }

  const updated = await prisma.release.findUnique({ where: { id: realId }, include: releaseInclude });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("editor");
  if (error) return error;
  await prisma.release.delete({ where: { id: (await prisma.release.findFirst({ where: { OR: [{ id }, { releaseCode: id }] } }))?.id ?? id } });
  return NextResponse.json({ ok: true });
}
