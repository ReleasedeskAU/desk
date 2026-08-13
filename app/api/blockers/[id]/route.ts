import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchBlockerSchema } from "@/lib/validation/blocker";
import { loadBlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config-db";
import { deniedBlockerEditFields } from "@/lib/blocker-lifecycle-edit-policy";
import {
  resolveBlockerLifecycleStatusRef,
  validateBlockerTransition,
} from "@/lib/blocker-lifecycle-transition";
import { keysWithActualBlockerPatchChanges } from "@/lib/blocker-patch-changed-keys";
import { cascadeUnblockReleaseOnBlockerResolved } from "@/lib/lifecycle-event-hooks";
import { editPolicyDeniedMessage } from "@/lib/edit-policy-user-message";
import {
  encodeUxNoticeHeader,
  UX_NOTICE_HEADER,
  type UxNotice,
} from "@/lib/ux-notice";

type Params = { params: Promise<{ id: string }> };

async function findBlocker(id: string) {
  return (
    (await prisma.blocker.findUnique({ where: { id } })) ??
    (await prisma.blocker.findUnique({ where: { blockerCode: id } }))
  );
}

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function mapBlocker(
  row: NonNullable<Awaited<ReturnType<typeof findBlocker>>>,
  release: {
    id: string;
    releaseCode: string;
    name: string;
    status: string;
  } | null
) {
  return {
    id: row.id,
    blockerCode: row.blockerCode,
    releaseCode: row.releaseCode,
    releaseName: row.releaseName,
    department: row.departmentName,
    application: row.applicationName,
    blockerType: row.blockerType,
    blockerDescription: row.blockerDescription,
    severity: row.severity,
    raisedDate: row.raisedDate,
    raisedBy: row.raisedBy,
    assignedTo: row.assignedTo,
    status: row.status,
    targetResolutionDate: row.targetResolutionDate,
    actualResolutionDate: row.actualResolutionDate,
    daysOpen: row.daysOpen,
    escalationLevel: row.escalationLevel,
    rootCause: row.rootCause,
    resolutionNotes: row.resolutionNotes,
    impactOnRelease: row.impactOnRelease,
    release,
  };
}

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row = await findBlocker(id);
  if (!row) return NextResponse.json({ error: "Blocker not found" }, { status: 404 });

  const release = await prisma.release.findUnique({
    where: { releaseCode: row.releaseCode },
    select: { id: true, releaseCode: true, name: true, status: true },
  });

  return NextResponse.json(mapBlocker(row, release));
}

/**
 * Updates blocker fields. Blocker ID (blockerCode) is intentionally immutable —
 * rejected by patchBlockerSchema.strict() if present in the body.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findBlocker(id);
  if (!existing) return NextResponse.json({ error: "Blocker not found" }, { status: 404 });

  const parsed = patchBlockerSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  let nextStatusKey: string | undefined;
  // Lifecycle: edit policy + status transitions (config-driven).
  try {
    const { config } = await loadBlockerLifecycleConfig(user!.id);
    const proposedKeys = keysWithActualBlockerPatchChanges({
      existing: existing as unknown as Record<string, unknown>,
      body: body as unknown as Record<string, unknown>,
    });
    const { mode, denied } = deniedBlockerEditFields(
      config,
      existing.status,
      proposedKeys
    );
    if (denied.length > 0) {
      return NextResponse.json(
        {
          error: editPolicyDeniedMessage({
            entity: "blocker",
            mode,
            statusLabel: existing.status,
            deniedFields: denied,
          }),
          code: "EDIT_POLICY_DENIED",
          mode,
          denied,
        },
        { status: 409 }
      );
    }
    if (body.status !== undefined && String(body.status) !== existing.status) {
      const transition = validateBlockerTransition({
        config,
        fromStatus: existing.status,
        toStatus: String(body.status),
        overrideReason: body.overrideReason ?? null,
        facts: {
          assignedTo:
            body.assignedTo !== undefined ? body.assignedTo : existing.assignedTo,
          resolutionNotes:
            body.resolutionNotes !== undefined
              ? body.resolutionNotes
              : existing.resolutionNotes,
          rootCause:
            body.rootCause !== undefined ? body.rootCause : existing.rootCause,
        },
      });
      if (!transition.allowed) {
        return NextResponse.json(
          {
            error: transition.reason,
            code: transition.code,
            unmetReasons: transition.unmetReasons ?? [],
            transition,
          },
          { status: 422 }
        );
      }
      // Persist the lifecycle-canonical label and key (Wave 4).
      body.status = transition.canonicalStatus;
      nextStatusKey = resolveBlockerLifecycleStatusRef(
        config,
        transition.canonicalStatus
      )?.key;
    }
  } catch (err) {
    console.error("[blockers PATCH] lifecycle enforcement failed", {
      blockerId: existing.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Blocker lifecycle validation is temporarily unavailable" },
      { status: 500 }
    );
  }

  const raisedDate = parseDate(body.raisedDate);
  const targetResolutionDate = parseDate(body.targetResolutionDate);
  const actualResolutionDate = parseDate(body.actualResolutionDate);
  for (const [key, raw, parsedDate] of [
    ["raisedDate", body.raisedDate, raisedDate],
    ["targetResolutionDate", body.targetResolutionDate, targetResolutionDate],
    ["actualResolutionDate", body.actualResolutionDate, actualResolutionDate],
  ] as const) {
    if (raw !== undefined && raw !== null && parsedDate === undefined) {
      return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
    }
  }

  if (body.releaseCode !== undefined) {
    const release = await prisma.release.findUnique({
      where: { releaseCode: body.releaseCode },
      select: { id: true },
    });
    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = {};
  if (body.releaseCode !== undefined) data.releaseCode = body.releaseCode;
  if (body.releaseName !== undefined) data.releaseName = body.releaseName;
  if (body.department !== undefined) data.departmentName = body.department;
  if (body.application !== undefined) data.applicationName = body.application;
  if (body.blockerType !== undefined) data.blockerType = body.blockerType;
  if (body.blockerDescription !== undefined) data.blockerDescription = body.blockerDescription;
  if (body.severity !== undefined) data.severity = body.severity;
  if (body.raisedBy !== undefined) data.raisedBy = body.raisedBy;
  if (body.status !== undefined) {
    data.status = body.status;
    if (nextStatusKey) data.statusKey = nextStatusKey;
  }
  if (body.escalationLevel !== undefined) data.escalationLevel = body.escalationLevel;
  if (body.impactOnRelease !== undefined) data.impactOnRelease = body.impactOnRelease;
  if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo;
  if (body.rootCause !== undefined) data.rootCause = body.rootCause;
  if (body.resolutionNotes !== undefined) data.resolutionNotes = body.resolutionNotes;
  if (raisedDate !== undefined) data.raisedDate = raisedDate;
  if (targetResolutionDate !== undefined) data.targetResolutionDate = targetResolutionDate;
  if (actualResolutionDate !== undefined) data.actualResolutionDate = actualResolutionDate;
  if (body.daysOpen !== undefined) data.daysOpen = body.daysOpen;

  const row = await prisma.blocker.update({ where: { id: existing.id }, data });

  const uxNotices: UxNotice[] = [];
  // CASC-02: entering the unblock-parent status can return a Blocked release.
  if (body.status !== undefined) {
    try {
      const { config: blockerConfig } = await loadBlockerLifecycleConfig(user!.id);
      const next = resolveBlockerLifecycleStatusRef(blockerConfig, row.status);
      const prev = resolveBlockerLifecycleStatusRef(blockerConfig, existing.status);
      if (next?.unblocksParent && !prev?.unblocksParent) {
        const casc = await cascadeUnblockReleaseOnBlockerResolved(
          row.releaseCode,
          user!.id
        );
        if (casc.roleFault) {
          console.error("[blockers PATCH] CASC-02 role fault", casc.roleFault);
          uxNotices.push({
            title: "Automation needs a Settings fix",
            message: casc.roleFault.message,
          });
        }
      }
    } catch (cascErr) {
      console.warn("[blockers PATCH] CASC-02 auto-unblock failed", {
        blockerCode: row.blockerCode,
        message: cascErr instanceof Error ? cascErr.message : "unknown",
      });
    }
  }

  const release = await prisma.release.findUnique({
    where: { releaseCode: row.releaseCode },
    select: { id: true, releaseCode: true, name: true, status: true },
  });

  if (uxNotices.length > 0) {
    return NextResponse.json(mapBlocker(row, release), {
      headers: {
        [UX_NOTICE_HEADER]: encodeUxNoticeHeader(uxNotices),
        "Access-Control-Expose-Headers": UX_NOTICE_HEADER,
      },
    });
  }
  return NextResponse.json(mapBlocker(row, release));
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findBlocker(id);
  if (!existing) return NextResponse.json({ error: "Blocker not found" }, { status: 404 });

  await prisma.blocker.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
