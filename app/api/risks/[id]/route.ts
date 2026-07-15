import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchRiskSchema } from "@/lib/validation/risk";

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
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findRisk(id);
  if (!existing) return NextResponse.json({ error: "Risk not found" }, { status: 404 });

  const parsed = patchRiskSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  if (body.releaseId !== undefined) {
    const release = await prisma.release.findUnique({ where: { id: body.releaseId }, select: { id: true } });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 400 });
  }
  if (body.riskOwnerId) {
    const owner = await prisma.user.findUnique({ where: { id: body.riskOwnerId }, select: { id: true } });
    if (!owner) return NextResponse.json({ error: "Risk owner not found" }, { status: 400 });
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
  if (body.applicationName !== undefined) data.applicationName = body.applicationName;
  if (body.departmentName !== undefined) data.departmentName = body.departmentName;
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
