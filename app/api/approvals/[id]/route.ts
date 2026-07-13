import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row =
    (await prisma.approval.findUnique({
      where: { id },
      include: {
        release: { select: { id: true, releaseCode: true, name: true, status: true, releaseDate: true } },
        approver: { select: { id: true, userId: true, name: true, email: true, role: true } },
      },
    })) ??
    (await prisma.approval.findUnique({
      where: { approvalCode: id },
      include: {
        release: { select: { id: true, releaseCode: true, name: true, status: true, releaseDate: true } },
        approver: { select: { id: true, userId: true, name: true, email: true, role: true } },
      },
    }));

  if (!row) return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  return NextResponse.json(row);
}
