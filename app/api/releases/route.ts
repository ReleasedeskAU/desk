import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { releaseListOrderBy, releaseListWhere, sp } from "@/lib/list-api-filters";
import { generateReleaseId, normalizeProgramProject } from "@/lib/release-id";
import { createReleaseRow } from "@/lib/org-compat";
import {
  getLatestLifecycleConfigVersionId,
  loadReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config-db";
import {
  defaultReleaseStatusLabel,
  isEnabledReleaseStatusLabel,
} from "@/lib/release-lifecycle-status-ui";

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

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;
  const params = sp(req);
  const data = await prisma.release.findMany({
    where: releaseListWhere(params),
    include: {
      department: true,
      applications: { include: { application: true } },
      dependsOn: { include: { dependsOnRelease: true } },
      stakeholders: { include: { user: true } },
      releaseOwner: { select: { id: true, userId: true, name: true } },
    },
    orderBy: releaseListOrderBy(params),
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;
  const body = await req.json();

  // Only load codes when we need to generate one — avoid a full-table scan on every create.
  let releaseCode = typeof body.releaseCode === "string" ? body.releaseCode.trim() : "";
  if (!releaseCode) {
    const existing = await prisma.release.findMany({ select: { releaseCode: true } });
    releaseCode = generateReleaseId(existing.map((r) => r.releaseCode));
  }

  const releaseDate = body.releaseDate ? new Date(body.releaseDate) : new Date();

  // Pin new releases to the creator's latest lifecycle snapshot so mid-flight
  // config edits cannot re-route them. Existing rows stay unpinned until backfill.
  // Status must be an enabled label in the creator's lifecycle config (SSOT).
  let lifecycleConfigVersionId: string | null = null;
  let status = String(body.status ?? "").trim();
  try {
    const loaded = await loadReleaseLifecycleConfig(user!.id);
    const defaultStatus = defaultReleaseStatusLabel(loaded.config) || "Draft";
    if (!status) status = defaultStatus;
    if (!isEnabledReleaseStatusLabel(loaded.config, status)) {
      return NextResponse.json(
        { error: "Status is not enabled in the release lifecycle configuration" },
        { status: 400 }
      );
    }
    lifecycleConfigVersionId =
      loaded.latestVersionId ??
      (await getLatestLifecycleConfigVersionId(user!.id));
  } catch (pinError) {
    console.error("[release-create] lifecycle config load failed", {
      clerkUserId: user!.id,
      message: pinError instanceof Error ? pinError.message : "unknown",
    });
    return NextResponse.json(
      { error: "Release lifecycle configuration is temporarily unavailable" },
      { status: 503 }
    );
  }

  const created = await createReleaseRow({
      releaseCode,
      name: String(body.name ?? ""),
      programProject: normalizeProgramProject(body.programProject ?? "") ?? "N/A",
      owner: String(body.owner ?? "Unknown"),
      status,
      releaseDate,
      priority: String(body.priority ?? "P3 - Medium"),
      impact: String(body.impact ?? "Medium"),
      departmentId: String(body.departmentId),
      notes: optionalString(body.notes) ?? null,
      dependencies: optionalString(body.dependencies) ?? null,
      releaseSize: optionalString(body.releaseSize) ?? null,
      cabDate: optionalDate(body.cabDate) ?? null,
      startDate: optionalDate(body.startDate) ?? null,
      testEnvRequired: optionalString(body.testEnvRequired) ?? null,
      uatEnvRequired: optionalString(body.uatEnvRequired) ?? null,
      conflictFlag: Boolean(body.conflictFlag),
      conflictId: optionalString(body.conflictId) ?? null,
      readinessPercent: optionalFloat(body.readinessPercent) ?? null,
      blockers: optionalString(body.blockers) ?? null,
      vendorMaintenance: optionalString(body.vendorMaintenance) ?? null,
      changeFreeze: optionalString(body.changeFreeze) ?? null,
      regulatory: optionalString(body.regulatory) ?? null,
      approvalStatus: optionalString(body.approvalStatus) ?? null,
      rollbackPlan: optionalString(body.rollbackPlan) ?? null,
      goLiveChecklistPercent: optionalFloat(body.goLiveChecklistPercent) ?? null,
      deploymentWindow: optionalString(body.deploymentWindow) ?? null,
      releaseOwnerId: optionalString(body.releaseOwnerId) ?? null,
      lifecycleConfigVersionId,
    });
  await Promise.all([
    body.applicationIds?.length
      ? prisma.releaseApplication.createMany({
          data: body.applicationIds.map((applicationId: string) => ({ releaseId: created.id, applicationId })),
        })
      : Promise.resolve(),
    body.dependsOnReleaseIds?.length
      ? prisma.releaseDependency.createMany({
          data: body.dependsOnReleaseIds.map((dependsOnReleaseId: string) => ({ releaseId: created.id, dependsOnReleaseId })),
        })
      : Promise.resolve(),
    body.stakeholderIds?.length
      ? prisma.releaseStakeholder.createMany({
          data: body.stakeholderIds.map((userId: string) => ({ releaseId: created.id, userId })),
        })
      : Promise.resolve(),
  ]);

  const row = await prisma.release.findUniqueOrThrow({
    where: { id: created.id },
    include: {
      department: true,
      applications: { include: { application: true } },
      dependsOn: { include: { dependsOnRelease: true } },
      stakeholders: { include: { user: true } },
      releaseOwner: { select: { id: true, userId: true, name: true } },
    },
  });
  return NextResponse.json(row, { status: 201 });
}
