import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchDriftSchema } from "@/lib/validation/drift";

type Params = { params: Promise<{ id: string }> };

const driftInclude = {
  release: { select: { id: true, releaseCode: true, name: true, status: true } },
  application: { select: { id: true, name: true } },
} as const;

async function findDrift(id: string) {
  return (
    (await prisma.drift.findUnique({ where: { id }, include: driftInclude })) ??
    (await prisma.drift.findUnique({ where: { driftCode: id }, include: driftInclude }))
  );
}

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row = await findDrift(id);
  if (!row) return NextResponse.json({ error: "Drift not found" }, { status: 404 });
  return NextResponse.json(row);
}

/**
 * Updates allowlisted drift fields. driftCode is immutable (schema.strict).
 */
export async function PATCH(req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findDrift(id);
  if (!existing) return NextResponse.json({ error: "Drift not found" }, { status: 404 });

  const parsed = patchDriftSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const detectedDate = parseDate(body.detectedDate);
  const etaToFix = parseDate(body.etaToFix);
  if (body.detectedDate !== undefined && detectedDate === undefined) {
    return NextResponse.json({ error: "Invalid detectedDate" }, { status: 400 });
  }
  if (body.etaToFix !== undefined && body.etaToFix !== null && etaToFix === undefined) {
    return NextResponse.json({ error: "Invalid etaToFix" }, { status: 400 });
  }

  const nextReleaseId = body.releaseId ?? existing.releaseId;
  const nextApplicationId = body.applicationId ?? existing.applicationId;
  const nextEnvironmentName = body.environmentName ?? existing.environmentName;
  let resolvedDepartmentName = body.departmentName;

  if (body.releaseId !== undefined || body.applicationId !== undefined || body.environmentName !== undefined) {
    const [release, application, environment] = await Promise.all([
      prisma.release.findUnique({
        where: { id: nextReleaseId },
        select: {
          id: true,
          departmentId: true,
          applications: { where: { applicationId: nextApplicationId }, select: { applicationId: true } },
        },
      }),
      prisma.application.findUnique({
        where: { id: nextApplicationId },
        select: { id: true, department: { select: { id: true, name: true } } },
      }),
      prisma.environment.findUnique({
        where: { applicationId_name: { applicationId: nextApplicationId, name: nextEnvironmentName } },
        select: { id: true },
      }),
    ]);
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 400 });
    if (!application) return NextResponse.json({ error: "Application not found" }, { status: 400 });
    if (!release.applications.length) {
      return NextResponse.json({ error: "Application is not linked to the selected release" }, { status: 400 });
    }
    if (application.department.id !== release.departmentId) {
      return NextResponse.json({ error: "Application and release must belong to the same department" }, { status: 400 });
    }
    if (!environment) {
      return NextResponse.json({ error: "Environment not found for the selected application" }, { status: 400 });
    }
    // Department is derived from the application FK — not free-text.
    resolvedDepartmentName = application.department.name;
  }

  const data: Record<string, unknown> = {};
  if (body.releaseId !== undefined) data.releaseId = body.releaseId;
  if (body.applicationId !== undefined) data.applicationId = body.applicationId;
  if (resolvedDepartmentName !== undefined) data.departmentName = resolvedDepartmentName;
  if (body.environmentName !== undefined) data.environmentName = body.environmentName;
  if (body.driftType !== undefined) data.driftType = body.driftType;
  if (body.driftCategory !== undefined) data.driftCategory = body.driftCategory;
  if (detectedDate !== undefined) data.detectedDate = detectedDate;
  if (body.severity !== undefined) data.severity = body.severity;
  if (body.description !== undefined) data.description = body.description;
  if (body.impactOnRelease !== undefined) data.impactOnRelease = body.impactOnRelease;
  if (body.remediationAction !== undefined) data.remediationAction = body.remediationAction;
  if (body.status !== undefined) data.status = body.status;
  if (etaToFix !== undefined) data.etaToFix = etaToFix;

  const row = await prisma.drift.update({
    where: { id: existing.id },
    data,
    include: driftInclude,
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findDrift(id);
  if (!existing) return NextResponse.json({ error: "Drift not found" }, { status: 404 });

  await prisma.drift.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
