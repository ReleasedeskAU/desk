import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchDriftSchema } from "@/lib/validation/drift";
import { loadDriftLifecycleConfig } from "@/lib/drift-lifecycle-config-db";
import { deniedDriftEditFields } from "@/lib/drift-lifecycle-edit-policy";
import {
  resolveDriftLifecycleStatusRef,
  validateDriftTransition,
} from "@/lib/drift-lifecycle-transition";
import {
  createMonitoringAlertOnDriftEscalated,
  isDriftEscalatedStatus,
} from "@/lib/lifecycle-event-hooks";
import { editPolicyDeniedMessage } from "@/lib/edit-policy-user-message";

type Params = { params: Promise<{ id: string }> };

const driftInclude = {
  release: { select: { id: true, releaseCode: true, name: true, status: true } },
  application: { select: { id: true, name: true } },
} as const;

async function findDrift(id: string) {
  return (
    (await prisma.drift.findUnique({ where: { id }, include: driftInclude })) ??
    (await prisma.drift.findUnique({ where: { driftCode: id }, include: driftInclude }))
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
  const row = await findDrift(id);
  if (!row) return NextResponse.json({ error: "Drift not found" }, { status: 404 });
  return NextResponse.json(row);
}

/**
 * Updates allowlisted drift fields. driftCode is immutable (schema.strict).
 * Enforces lifecycle edit policy and status transitions (config-driven).
 */
export async function PATCH(req: Request, { params }: Params) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findDrift(id);
  if (!existing) return NextResponse.json({ error: "Drift not found" }, { status: 404 });

  const parsed = patchDriftSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  let nextStatusKey: string | undefined;
  // Lifecycle: edit policy + status transitions (config-driven).
  try {
    const { config } = await loadDriftLifecycleConfig(user!.id);
    const proposedKeys = Object.keys(body);
    const { mode, denied } = deniedDriftEditFields(
      config,
      existing.status,
      proposedKeys
    );
    if (denied.length > 0) {
      return NextResponse.json(
        {
          error: editPolicyDeniedMessage({
            entity: "drift",
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
      const transition = validateDriftTransition({
        config,
        fromStatus: existing.status,
        toStatus: String(body.status),
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
      body.status = transition.canonicalStatus;
      nextStatusKey = resolveDriftLifecycleStatusRef(
        config,
        transition.canonicalStatus
      )?.key;
    }
  } catch (err) {
    console.error("[drifts PATCH] lifecycle enforcement failed", {
      driftId: existing.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Drift lifecycle validation is temporarily unavailable" },
      { status: 500 }
    );
  }

  const detectedDate = parseDate(body.detectedDate);
  const etaToFix = parseDate(body.etaToFix);
  if (body.detectedDate !== undefined && detectedDate === undefined) {
    return NextResponse.json({ error: "Invalid detectedDate" }, { status: 400 });
  }
  if (body.etaToFix !== undefined && body.etaToFix !== null && etaToFix === undefined) {
    return NextResponse.json({ error: "Invalid etaToFix" }, { status: 400 });
  }

  const nextReleaseId = body.releaseId ?? existing.releaseId;
  const nextApplicationId = body.applicationId ?? existing.applicationId;
  const nextEnvironmentName = body.environmentName ?? existing.environmentName;
  let resolvedDepartmentName = body.departmentName;

  if (body.releaseId !== undefined || body.applicationId !== undefined || body.environmentName !== undefined) {
    const [release, application, environment] = await Promise.all([
      prisma.release.findUnique({
        where: { id: nextReleaseId },
        select: {
          id: true,
          departmentId: true,
          applications: { where: { applicationId: nextApplicationId }, select: { applicationId: true } },
        },
      }),
      prisma.application.findUnique({
        where: { id: nextApplicationId },
        select: { id: true, department: { select: { id: true, name: true } } },
      }),
      prisma.environment.findUnique({
        where: { applicationId_name: { applicationId: nextApplicationId, name: nextEnvironmentName } },
        select: { id: true },
      }),
    ]);
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 400 });
    if (!application) return NextResponse.json({ error: "Application not found" }, { status: 400 });
    if (!release.applications.length) {
      return NextResponse.json({ error: "Application is not linked to the selected release" }, { status: 400 });
    }
    if (application.department.id !== release.departmentId) {
      return NextResponse.json({ error: "Application and release must belong to the same department" }, { status: 400 });
    }
    if (!environment) {
      return NextResponse.json({ error: "Environment not found for the selected application" }, { status: 400 });
    }
    // Department is derived from the application FK — not free-text.
    resolvedDepartmentName = application.department.name;
  }

  const data: Record<string, unknown> = {};
  if (body.releaseId !== undefined) data.releaseId = body.releaseId;
  if (body.applicationId !== undefined) data.applicationId = body.applicationId;
  if (resolvedDepartmentName !== undefined) data.departmentName = resolvedDepartmentName;
  if (body.environmentName !== undefined) data.environmentName = body.environmentName;
  if (body.driftType !== undefined) data.driftType = body.driftType;
  if (body.driftCategory !== undefined) data.driftCategory = body.driftCategory;
  if (detectedDate !== undefined) data.detectedDate = detectedDate;
  if (body.severity !== undefined) data.severity = body.severity;
  if (body.description !== undefined) data.description = body.description;
  if (body.impactOnRelease !== undefined) data.impactOnRelease = body.impactOnRelease;
  if (body.remediationAction !== undefined) data.remediationAction = body.remediationAction;
  if (body.status !== undefined) {
    data.status = body.status;
    if (nextStatusKey) data.statusKey = nextStatusKey;
  }
  if (etaToFix !== undefined) data.etaToFix = etaToFix;

  const row = await prisma.drift.update({
    where: { id: existing.id },
    data,
    include: driftInclude,
  });

  // AV-14: MonitoringAlert only when status newly lands on the escalate target.
  const { config: driftConfig } = await loadDriftLifecycleConfig(user!.id);
  if (
    body.status !== undefined &&
    isDriftEscalatedStatus(String(row.status), driftConfig) &&
    !isDriftEscalatedStatus(existing.status, driftConfig)
  ) {
    try {
      await createMonitoringAlertOnDriftEscalated({
        driftCode: row.driftCode,
        applicationId: row.applicationId,
        departmentName: row.departmentName,
        environmentName: row.environmentName,
        severity: row.severity,
      });
    } catch (hookErr) {
      console.warn("[drifts PATCH] AV-14 monitoring alert failed", {
        driftCode: row.driftCode,
        message: hookErr instanceof Error ? hookErr.message : "unknown",
      });
    }
  }

  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findDrift(id);
  if (!existing) return NextResponse.json({ error: "Drift not found" }, { status: 404 });

  await prisma.drift.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
