import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchApprovalSchema } from "@/lib/validation/approval";
import { loadApprovalLifecycleConfig } from "@/lib/approval-lifecycle-config-db";
import { deniedApprovalEditFields } from "@/lib/approval-lifecycle-edit-policy";
import {
  approvalDecisionRevertsLinkedRelease,
  resolveApprovalLifecycleStatusRef,
  validateApprovalTransition,
} from "@/lib/approval-lifecycle-transition";
import { keysWithActualApprovalPatchChanges } from "@/lib/approval-patch-changed-keys";
import { cascadeRevertReleaseOnApprovalDecision } from "@/lib/release-related-entity-guards";
import { editPolicyDeniedMessage } from "@/lib/edit-policy-user-message";
import {
  encodeUxNoticeHeader,
  UX_NOTICE_HEADER,
  type UxNotice,
} from "@/lib/ux-notice";

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

function appendRecordedReason(
  existing: string | null | undefined,
  reason: string
): string {
  const line = `Exception reason: ${reason.trim()}`;
  const cur = (existing ?? "").trim();
  if (cur.includes(line)) return cur;
  return cur ? `${cur}\n${line}` : line;
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

  let nextDecisionKey: string | undefined;
  let recordedOverride: string | undefined;
  const uxNotices: UxNotice[] = [];
  try {
    const { config } = await loadApprovalLifecycleConfig(user!.id);
    const proposedKeys = keysWithActualApprovalPatchChanges({
      existing: existing as unknown as Record<string, unknown>,
      body: body as unknown as Record<string, unknown>,
    });
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
        conditions:
          body.conditions !== undefined
            ? body.conditions
            : ((existing as { conditions?: string | null }).conditions ?? null),
      });
      if (!transition.allowed) {
        return NextResponse.json(
          {
            error: transition.reason,
            code: transition.code,
            unmetReasons: transition.unmetReasons,
            transition,
          },
          { status: 422 }
        );
      }
      body.decision = transition.canonicalStatus;
      nextDecisionKey = resolveApprovalLifecycleStatusRef(
        config,
        transition.canonicalStatus
      )?.key;
      if (transition.overridden && transition.overrideReason) {
        recordedOverride = transition.overrideReason;
      }
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
    const approver = await prisma.user.findUnique({ where: { id: body.approverId }, select: { id: true } });
    if (!approver) return NextResponse.json({ error: "Approver not found" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.releaseId !== undefined) data.releaseId = body.releaseId;
  if (body.applicationName !== undefined) data.applicationName = body.applicationName;
  if (body.departmentName !== undefined) data.departmentName = body.departmentName;
  if (body.approvalType !== undefined) data.approvalType = body.approvalType;
  if (body.approverId !== undefined) data.approverId = body.approverId;
  if (submittedDate !== undefined) data.submittedDate = submittedDate;
  if (decisionDate !== undefined) data.decisionDate = decisionDate;
  if (body.decision !== undefined) {
    data.decision = body.decision;
    if (nextDecisionKey) data.decisionKey = nextDecisionKey;
  }
  if (body.comments !== undefined) data.comments = body.comments;
  if (body.cabMeetingId !== undefined) data.cabMeetingId = body.cabMeetingId;
  if (body.conditions !== undefined) data.conditions = body.conditions;
  if (recordedOverride) {
    const base =
      body.comments !== undefined
        ? body.comments
        : existing.comments;
    data.comments = appendRecordedReason(
      typeof base === "string" ? base : null,
      recordedOverride
    );
  }

  const row = await prisma.approval.update({
    where: { id: existing.id },
    data,
    include: approvalInclude,
  });

  if (
    body.decision !== undefined &&
    String(row.decision) !== existing.decision
  ) {
    try {
      const { config } = await loadApprovalLifecycleConfig(user!.id);
      if (approvalDecisionRevertsLinkedRelease(config, row.decision)) {
        const casc = await cascadeRevertReleaseOnApprovalDecision(
          row.releaseId,
          user!.id,
          config,
          row.decision
        );
        if (casc.roleFault) {
          uxNotices.push({
            title: "Automation needs a Settings fix",
            message: casc.roleFault.message,
          });
        } else if (casc.count > 0) {
          uxNotices.push({
            title: "Linked release moved back",
            message:
              "This rejection moved the linked release to the landing status configured in Release Lifecycle (Planning by default).",
          });
        }
      }
    } catch (cascErr) {
      console.warn("[approvals PATCH] release revert cascade failed", {
        approvalId: existing.id,
        message: cascErr instanceof Error ? cascErr.message : "unknown",
      });
    }
  }

  if (uxNotices.length > 0) {
    return NextResponse.json(row, {
      headers: {
        [UX_NOTICE_HEADER]: encodeUxNoticeHeader(uxNotices),
        "Access-Control-Expose-Headers": UX_NOTICE_HEADER,
      },
    });
  }
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
