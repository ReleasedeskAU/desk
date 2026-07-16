import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { approvalWhere, sp } from "@/lib/list-api-filters";
import { zodErrorResponse } from "@/lib/api-errors";
import { createApprovalSchema } from "@/lib/validation/approval";
import { createApprovalRow } from "@/lib/org-compat";

async function nextApprovalCode(): Promise<string> {
  const rows = await prisma.approval.findMany({ select: { approvalCode: true } });
  const max = rows.reduce((current, row) => {
    const match = /^APR-(\d+)$/i.exec(row.approvalCode);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `APR-${String(max + 1).padStart(4, "0")}`;
}

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

/** Creates an editor-authorized approval and derives its identity and release metadata server-side. */
export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = createApprovalSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  const release = await prisma.release.findUnique({
    where: { id: body.releaseId },
    include: {
      department: { select: { name: true } },
      applications: { include: { application: { select: { name: true } } }, take: 1 },
    },
  });
  if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });
  const approver = await prisma.user.findUnique({ where: { id: body.approverId }, select: { id: true } });
  if (!approver) return NextResponse.json({ error: "Approver not found" }, { status: 404 });

  const maxOrder = await prisma.approval.aggregate({ _max: { sourceOrder: true } });
  const row = await createApprovalRow({
    approvalCode: await nextApprovalCode(),
    releaseId: body.releaseId,
    applicationName: release.applications[0]?.application.name ?? null,
    departmentName: release.department.name,
    approvalType: body.approvalType,
    approverId: body.approverId,
    submittedDate: new Date(body.submittedDate),
    decisionDate: body.decisionDate ? new Date(body.decisionDate) : null,
    decision: body.decision ?? "Pending",
    comments: body.comments ?? null,
    cabMeetingId: body.cabMeetingId ?? null,
    sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
  });
  return NextResponse.json(row, { status: 201 });
}
