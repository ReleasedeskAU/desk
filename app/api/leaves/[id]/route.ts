import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchLeaveSchema } from "@/lib/validation/leave";

type Params = { params: Promise<{ id: string }> };

const leaveInclude = {
  user: { select: { id: true, userId: true, name: true, role: true, department: true } },
  affectedReleases: {
    include: {
      release: { select: { id: true, releaseCode: true, name: true, status: true } },
    },
  },
} as const;

async function findLeave(id: string) {
  return (
    (await prisma.leaveRecord.findUnique({ where: { id }, include: leaveInclude })) ??
    (await prisma.leaveRecord.findUnique({ where: { leaveCode: id }, include: leaveInclude }))
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
  const row = await findLeave(id);
  if (!row) return NextResponse.json({ error: "Leave record not found" }, { status: 404 });
  return NextResponse.json(row);
}

/**
 * Updates leave calendar fields. Leave ID (leaveCode) is intentionally immutable.
 * Employee identity stays linked via userId — not rewritten from this endpoint.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findLeave(id);
  if (!existing) return NextResponse.json({ error: "Leave record not found" }, { status: 404 });

  const parsed = patchLeaveSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const leaveStart = parseDate(body.leaveStart);
  const leaveEnd = parseDate(body.leaveEnd);
  if (body.leaveStart !== undefined && body.leaveStart !== null && leaveStart === undefined) {
    return NextResponse.json({ error: "Invalid leaveStart" }, { status: 400 });
  }
  if (body.leaveEnd !== undefined && body.leaveEnd !== null && leaveEnd === undefined) {
    return NextResponse.json({ error: "Invalid leaveEnd" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.leaveType !== undefined) data.leaveType = body.leaveType;
  if (leaveStart !== undefined) data.leaveStart = leaveStart;
  if (leaveEnd !== undefined) data.leaveEnd = leaveEnd;
  if (body.days !== undefined) data.days = body.days;
  if (body.riskImpact !== undefined) data.riskImpact = body.riskImpact;
  if (body.riskScore !== undefined) data.riskScore = body.riskScore;

  const row = await prisma.leaveRecord.update({
    where: { id: existing.id },
    data,
    include: leaveInclude,
  });

  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findLeave(id);
  if (!existing) return NextResponse.json({ error: "Leave record not found" }, { status: 404 });

  await prisma.leaveRecord.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
