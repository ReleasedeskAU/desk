import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

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

function optionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
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

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.leaveType !== undefined) data.leaveType = String(body.leaveType).trim();
  const leaveStart = optionalDate(body.leaveStart);
  if (leaveStart !== undefined) data.leaveStart = leaveStart;
  const leaveEnd = optionalDate(body.leaveEnd);
  if (leaveEnd !== undefined) data.leaveEnd = leaveEnd;
  const days = optionalInt(body.days);
  if (days !== undefined) data.days = days;
  const riskImpact = optionalString(body.riskImpact);
  if (riskImpact !== undefined) data.riskImpact = riskImpact;
  const riskScore = optionalInt(body.riskScore);
  if (riskScore !== undefined) data.riskScore = riskScore;

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
