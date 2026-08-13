import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchIncidentSchema } from "@/lib/validation/incident";
import { loadIncidentLifecycleConfig } from "@/lib/incident-lifecycle-config-db";
import { deniedIncidentEditFields } from "@/lib/incident-lifecycle-edit-policy";
import {
  resolveIncidentLifecycleStatusRef,
  validateIncidentTransition,
} from "@/lib/incident-lifecycle-transition";
import { editPolicyDeniedMessage } from "@/lib/edit-policy-user-message";
import { keysWithActualIncidentPatchChanges } from "@/lib/incident-patch-changed-keys";
import { cascadeUnblockReleaseOnIncidentResolved } from "@/lib/lifecycle-event-hooks";
import {
  encodeUxNoticeHeader,
  UX_NOTICE_HEADER,
  type UxNotice,
} from "@/lib/ux-notice";

type Params = { params: Promise<{ id: string }> };

const incidentInclude = {
  application: { select: { id: true, name: true } },
} as const;

async function findIncident(id: string) {
  return (
    (await prisma.incident.findUnique({ where: { id }, include: incidentInclude })) ??
    (await prisma.incident.findUnique({ where: { incidentCode: id }, include: incidentInclude }))
  );
}

async function withRelatedRelease(row: NonNullable<Awaited<ReturnType<typeof findIncident>>>) {
  const relatedRelease = row.relatedReleaseCode
    ? await prisma.release.findUnique({
        where: { releaseCode: row.relatedReleaseCode },
        select: { id: true, releaseCode: true, name: true, status: true },
      })
    : null;
  return { ...row, relatedRelease };
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
  const row = await findIncident(id);
  if (!row) return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  return NextResponse.json(await withRelatedRelease(row));
}

/**
 * Updates allowlisted incident fields. incidentCode is immutable (schema.strict).
 * Status transitions and edit policy are enforced from the caller's incident lifecycle config.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findIncident(id);
  if (!existing) return NextResponse.json({ error: "Incident not found" }, { status: 404 });

  const parsed = patchIncidentSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  let nextStatusKey: string | undefined;
  // Lifecycle: edit policy + status transitions (config-driven soft gates).
  try {
    const { config } = await loadIncidentLifecycleConfig(user!.id);
    const proposedKeys = keysWithActualIncidentPatchChanges({
      existing: existing as unknown as Record<string, unknown>,
      body: body as unknown as Record<string, unknown>,
    });
    const { mode, denied } = deniedIncidentEditFields(
      config,
      existing.status,
      proposedKeys
    );
    if (denied.length > 0) {
      return NextResponse.json(
        {
          error: editPolicyDeniedMessage({
            entity: "incident",
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
      const transition = validateIncidentTransition({
        config,
        fromStatus: existing.status,
        toStatus: String(body.status),
        overrideReason: body.overrideReason ?? null,
        facts: {
          severity: body.severity ?? existing.severity,
          assignedTo:
            body.assignedTo !== undefined ? body.assignedTo : existing.assignedTo,
          relatedReleaseCode:
            body.relatedReleaseCode !== undefined
              ? body.relatedReleaseCode
              : existing.relatedReleaseCode,
        },
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
      body.status = transition.canonicalStatus;
      nextStatusKey = resolveIncidentLifecycleStatusRef(
        config,
        transition.canonicalStatus
      )?.key;
    }
  } catch (err) {
    console.error("[incidents PATCH] lifecycle enforcement failed", {
      incidentId: existing.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Incident lifecycle validation is temporarily unavailable" },
      { status: 500 }
    );
  }

  const timestamp = parseDate(body.timestamp);
  if (body.timestamp !== undefined && timestamp === undefined) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
  }

  if (body.applicationId !== undefined) {
    const app = await prisma.application.findUnique({ where: { id: body.applicationId }, select: { id: true } });
    if (!app) return NextResponse.json({ error: "Application not found" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (timestamp !== undefined) data.timestamp = timestamp;
  if (body.applicationId !== undefined) data.applicationId = body.applicationId;
  if (body.departmentName !== undefined) data.departmentName = body.departmentName;
  if (body.severity !== undefined) data.severity = body.severity;
  if (body.title !== undefined) data.title = body.title;
  if (body.status !== undefined) {
    data.status = body.status;
    if (nextStatusKey) data.statusKey = nextStatusKey;
  }
  if (body.impact !== undefined) data.impact = body.impact;
  if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo;
  if (body.relatedReleaseCode !== undefined) data.relatedReleaseCode = body.relatedReleaseCode;
  if (body.environmentName !== undefined) data.environmentName = body.environmentName;

  const row = await prisma.incident.update({
    where: { id: existing.id },
    data,
    include: incidentInclude,
  });

  const uxNotices: UxNotice[] = [];
  if (body.status !== undefined && row.relatedReleaseCode) {
    try {
      const { config: incidentConfig } = await loadIncidentLifecycleConfig(user!.id);
      const next = resolveIncidentLifecycleStatusRef(incidentConfig, row.status);
      const prev = resolveIncidentLifecycleStatusRef(incidentConfig, existing.status);
      if (next?.unblocksParent && !prev?.unblocksParent) {
        const casc = await cascadeUnblockReleaseOnIncidentResolved(
          row.relatedReleaseCode,
          user!.id
        );
        if (casc.roleFault) {
          console.error("[incidents PATCH] unblock role fault", casc.roleFault);
          uxNotices.push({
            title: "Automation needs a Settings fix",
            message: casc.roleFault.message,
          });
        }
      }
    } catch (cascErr) {
      console.warn("[incidents PATCH] incident auto-unblock failed", {
        incidentCode: row.incidentCode,
        message: cascErr instanceof Error ? cascErr.message : "unknown",
      });
    }
  }

  if (uxNotices.length > 0) {
    return NextResponse.json(await withRelatedRelease(row), {
      headers: {
        [UX_NOTICE_HEADER]: encodeUxNoticeHeader(uxNotices),
        "Access-Control-Expose-Headers": UX_NOTICE_HEADER,
      },
    });
  }
  return NextResponse.json(await withRelatedRelease(row));
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findIncident(id);
  if (!existing) return NextResponse.json({ error: "Incident not found" }, { status: 404 });

  await prisma.incident.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
