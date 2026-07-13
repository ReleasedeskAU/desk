import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { approvalWhere, sp } from "@/lib/list-api-filters";

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.approval.findMany({
    where: approvalWhere(sp(req)),
    include: {
      release: { select: { id: true, releaseCode: true, name: true, status: true, releaseDate: true } },
      approver: { select: { id: true, userId: true, name: true, email: true, role: true } },
    },
    orderBy: { sourceOrder: "asc" },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const body = await req.json();
  const row = await prisma.approval.create({
    data: {
      approvalCode: body.approvalCode,
      releaseId: body.releaseId,
      approvalType: body.approvalType,
      approverId: body.approverId,
      submittedDate: new Date(body.submittedDate),
      decisionDate: body.decisionDate ? new Date(body.decisionDate) : null,
      decision: body.decision ?? "Pending",
      comments: body.comments ?? null,
      cabMeetingId: body.cabMeetingId ?? null,
    },
    include: {
      release: { select: { id: true, releaseCode: true, name: true } },
      approver: { select: { id: true, userId: true, name: true } },
    },
  });
  return NextResponse.json(row, { status: 201 });
}
