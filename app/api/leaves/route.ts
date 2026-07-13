import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { leaveWhere, sp } from "@/lib/list-api-filters";

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.leaveRecord.findMany({
    where: leaveWhere(sp(req)),
    include: {
      user: { select: { id: true, userId: true, name: true, role: true, department: true } },
      affectedReleases: {
        include: {
          release: { select: { id: true, releaseCode: true, name: true, status: true, releaseDate: true } },
        },
      },
    },
    orderBy: { sourceOrder: "asc" },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const body = await req.json();
  const row = await prisma.leaveRecord.create({
    data: {
      leaveCode: body.leaveCode,
      userId: body.userId,
      leaveStart: new Date(body.leaveStart),
      leaveEnd: new Date(body.leaveEnd),
      leaveType: body.leaveType,
      days: body.days,
      riskImpact: body.riskImpact ?? null,
      riskScore: body.riskScore ?? 0,
      affectedReleases: body.releaseIds?.length
        ? { create: body.releaseIds.map((releaseId: string) => ({ releaseId })) }
        : undefined,
    },
    include: {
      user: { select: { id: true, userId: true, name: true } },
      affectedReleases: { include: { release: { select: { id: true, releaseCode: true, name: true } } } },
    },
  });
  return NextResponse.json(row, { status: 201 });
}
