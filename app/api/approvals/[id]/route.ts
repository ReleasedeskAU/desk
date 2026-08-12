import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchApprovalSchema } from "@/lib/validation/approval";
import { loadApprovalLifecycleConfig } from "@/lib/approval-lifecycle-config-db";
import { deniedApprovalEditFields } from "@/lib/approval-lifecycle-edit-policy";
import { validateApprovalTransition } from "@/lib/approval-lifecycle-transition";
import { editPolicyDeniedMessage } from "@/lib/edit-policy-user-message";

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
 * Decision transitions and edit policy are enforced from the caller's approval lifecycle config.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { user, error } = await requireRole("editor");
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

  // Lifecycle: edit policy + decision transitions (config-driven).
  try {
    const { config } = await loadApprovalLifecycleConfig(user!.id);
    const proposedKeys = Object.keys(body);
    const { mode, denied } = deniedApprovalEditFields(
      config,
      existing.decision,
      proposedKeys
    );
    if (denied.length > 0) {
      return NextResponse.json(
        {
          error: editPolicyDeniedMessage({
            entity: "approval",
            mode,
            statusWord: "decision",
            statusLabel: existing.decision,
            deniedFields: denied,
          }),
          code: "EDIT_POLICY_DENIED",
          mode,
          denied,
        },
        { status: 409 }
      );
    }
    if (body.decision !== undefined && String(body.decision) !== existing.decision) {
      const transition = validateApprovalTransition({
        config,
        fromStatus: existing.decision,
        toStatus: String(body.decision),
        overrideReason: body.overrideReason ?? null,
      });
      if (!transition.allowed) {
        return NextResponse.json(
          {
            error: transition.reason,
            code: transition.code,
            transition,
          },
          { status: 422 }
        );
      }
      // Persist the lifecycle-canonical label (not the raw client string).
      body.decision = transition.canonicalStatus;
    }
  } catch (err) {
    console.error("[approvals PATCH] lifecycle enforcement failed", {
      approvalId: existing.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Approval lifecycle validation is temporarily unavailable" },
      { status: 500 }
    );
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
