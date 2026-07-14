import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { releaseListOrderBy, releaseListWhere, sp } from "@/lib/list-api-filters";
import { generateReleaseId, normalizeProgramProject } from "@/lib/release-id";

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
  const { error } = await requireRole("editor");
  if (error) return error;
  const body = await req.json();

  // Only load codes when we need to generate one — avoid a full-table scan on every create.
  let releaseCode = typeof body.releaseCode === "string" ? body.releaseCode.trim() : "";
  if (!releaseCode) {
    const existing = await prisma.release.findMany({ select: { releaseCode: true } });
    releaseCode = generateReleaseId(existing.map((r) => r.releaseCode));
  }

  const releaseDate = body.releaseDate ? new Date(body.releaseDate) : new Date();

  const row = await prisma.release.create({
    data: {
      releaseCode,
      name: String(body.name ?? ""),
      programProject: normalizeProgramProject(body.programProject ?? "") ?? "N/A",
      owner: String(body.owner ?? "Unknown"),
      status: String(body.status ?? "Planned"),
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
      applications: body.applicationIds?.length
        ? { create: body.applicationIds.map((id: string) => ({ applicationId: id })) }
        : undefined,
      dependsOn: body.dependsOnReleaseIds?.length
        ? { create: body.dependsOnReleaseIds.map((dependsOnReleaseId: string) => ({ dependsOnReleaseId })) }
        : undefined,
      stakeholders: body.stakeholderIds?.length
        ? { create: body.stakeholderIds.map((userId: string) => ({ userId })) }
        : undefined,
    },
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
