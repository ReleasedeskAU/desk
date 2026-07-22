import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchRiskSchemaForScale } from "@/lib/validation/risk";
import { loadRiskEngineConfig } from "@/lib/risk-engine-config-db";

type Params = { params: Promise<{ id: string }> };

const riskInclude = {
  release: { select: { id: true, releaseCode: true, name: true, status: true, releaseDate: true } },
  riskOwner: { select: { id: true, userId: true, name: true, email: true } },
} as const;

async function findRisk(id: string) {
  return (
    (await prisma.risk.findUnique({ where: { id }, include: riskInclude })) ??
    (await prisma.risk.findUnique({ where: { riskCode: id }, include: riskInclude }))
  );
}

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row = await findRisk(id);
  if (!row) return NextResponse.json({ error: "Risk not found" }, { status: 404 });
  return NextResponse.json(row);
}

/**
 * Updates allowlisted risk fields. riskCode is immutable (schema.strict).
 * When likelihood or impact changes, riskScore is recomputed server-side.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findRisk(id);
  if (!existing) return NextResponse.json({ error: "Risk not found" }, { status: 404 });

  const riskConfig = await loadRiskEngineConfig(user!.id);
  const parsed = patchRiskSchemaForScale(
    riskConfig.likelihoodMax,
    riskConfig.impactMax
  ).safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const nextReleaseId = body.releaseId ?? existing.releaseId;
  if (body.releaseId !== undefined) {
    const release = await prisma.release.findUnique({ where: { id: body.releaseId }, select: { id: true } });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 400 });
  }
  if (body.riskOwnerId) {
    const owner = await prisma.user.findUnique({ where: { id: body.riskOwnerId }, select: { id: true } });
    if (!owner) return NextResponse.json({ error: "Risk owner not found" }, { status: 400 });
  }

  let resolvedApplicationName = body.applicationName;
  let resolvedDepartmentName = body.departmentName;
  if (body.applicationId !== undefined) {
    const [release, application] = await Promise.all([
      prisma.release.findUnique({
        where: { id: nextReleaseId },
        select: {
          id: true,
          department: { select: { id: true } },
          applications: { where: { applicationId: body.applicationId }, select: { applicationId: true } },
        },
      }),
      prisma.application.findUnique({
        where: { id: body.applicationId },
        select: { id: true, name: true, department: { select: { id: true, name: true } } },
      }),
    ]);
    if (!application) return NextResponse.json({ error: "Application not found" }, { status: 400 });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 400 });
    if (!release.applications.length) {
      return NextResponse.json({ error: "Application is not linked to the selected release" }, { status: 400 });
    }
    if (application.department.id !== release.department.id) {
      return NextResponse.json({ error: "Application and release must belong to the same department" }, { status: 400 });
    }
    resolvedApplicationName = application.name;
    resolvedDepartmentName = application.department.name;
  }

  const likelihood = body.likelihood ?? existing.likelihood;
  const impact = body.impact ?? existing.impact;
  const data: {
    releaseId?: string;
    applicationName?: string | null;
    departmentName?: string | null;
    category?: string;
    description?: string;
    likelihood?: number;
    impact?: number;
    riskScore?: number;
    affectedArea?: string | null;
    mitigationStrategy?: string | null;
    riskOwnerId?: string | null;
    status?: string;
    notes?: string | null;
  } = {};
  if (body.releaseId !== undefined) data.releaseId = body.releaseId;
  if (resolvedApplicationName !== undefined) data.applicationName = resolvedApplicationName;
  if (resolvedDepartmentName !== undefined) data.departmentName = resolvedDepartmentName;
  if (body.category !== undefined) data.category = body.category;
  if (body.description !== undefined) data.description = body.description;
  if (body.likelihood !== undefined) data.likelihood = body.likelihood;
  if (body.impact !== undefined) data.impact = body.impact;
  if (body.affectedArea !== undefined) data.affectedArea = body.affectedArea;
  if (body.mitigationStrategy !== undefined) data.mitigationStrategy = body.mitigationStrategy;
  if (body.riskOwnerId !== undefined) data.riskOwnerId = body.riskOwnerId;
  if (body.status !== undefined) data.status = body.status;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.likelihood !== undefined || body.impact !== undefined) {
    data.riskScore = likelihood * impact;
  }

  const row = await prisma.risk.update({
    where: { id: existing.id },
    data,
    include: riskInclude,
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findRisk(id);
  if (!existing) return NextResponse.json({ error: "Risk not found" }, { status: 404 });

  await prisma.risk.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
