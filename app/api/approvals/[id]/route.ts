import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchApprovalSchema } from "@/lib/validation/approval";

type Params = { params: Promise<{ id: string }> };

const approvalInclude = {
  release: { select: { id: true, releaseCode: true, name: true, status: true, releaseDate: true } },
  approver: { select: { id: true, userId: true, name: true, email: true, role: true } },
} as const;

async function findApproval(id: string) {
  return (
    (await prisma.approval.findUnique({ where: { id }, include: approvalInclude })) ??
    (await prisma.approval.findUnique({ where: { approvalCode: id }, include: approvalInclude }))
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
  const row = await findApproval(id);
  if (!row) return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  return NextResponse.json(row);
}

/**
 * Updates allowlisted approval fields. approvalCode is immutable (schema.strict).
 */
export async function PATCH(req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findApproval(id);
  if (!existing) return NextResponse.json({ error: "Approval not found" }, { status: 404 });

  const parsed = patchApprovalSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const submittedDate = parseDate(body.submittedDate);
  const decisionDate = parseDate(body.decisionDate);
  if (body.submittedDate !== undefined && submittedDate === undefined) {
    return NextResponse.json({ error: "Invalid submittedDate" }, { status: 400 });
  }
  if (body.decisionDate !== undefined && body.decisionDate !== null && decisionDate === undefined) {
    return NextResponse.json({ error: "Invalid decisionDate" }, { status: 400 });
  }

  if (body.releaseId !== undefined) {
    const release = await prisma.release.findUnique({ where: { id: body.releaseId }, select: { id: true } });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 400 });
  }
  if (body.approverId !== undefined) {
    const user = await prisma.user.findUnique({ where: { id: body.approverId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "Approver not found" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.releaseId !== undefined) data.releaseId = body.releaseId;
  if (body.applicationName !== undefined) data.applicationName = body.applicationName;
  if (body.departmentName !== undefined) data.departmentName = body.departmentName;
  if (body.approvalType !== undefined) data.approvalType = body.approvalType;
  if (body.approverId !== undefined) data.approverId = body.approverId;
  if (submittedDate !== undefined) data.submittedDate = submittedDate;
  if (decisionDate !== undefined) data.decisionDate = decisionDate;
  if (body.decision !== undefined) data.decision = body.decision;
  if (body.comments !== undefined) data.comments = body.comments;
  if (body.cabMeetingId !== undefined) data.cabMeetingId = body.cabMeetingId;

  const row = await prisma.approval.update({
    where: { id: existing.id },
    data,
    include: approvalInclude,
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findApproval(id);
  if (!existing) return NextResponse.json({ error: "Approval not found" }, { status: 404 });

  await prisma.approval.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
