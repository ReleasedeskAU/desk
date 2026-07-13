import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row =
    (await prisma.leaveRecord.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, userId: true, name: true, role: true, department: true } },
        affectedReleases: {
          include: {
            release: { select: { id: true, releaseCode: true, name: true, status: true } },
          },
        },
      },
    })) ??
    (await prisma.leaveRecord.findUnique({
      where: { leaveCode: id },
      include: {
        user: { select: { id: true, userId: true, name: true, role: true, department: true } },
        affectedReleases: {
          include: {
            release: { select: { id: true, releaseCode: true, name: true, status: true } },
          },
        },
      },
    }));

  if (!row) return NextResponse.json({ error: "Leave record not found" }, { status: 404 });
  return NextResponse.json(row);
}
