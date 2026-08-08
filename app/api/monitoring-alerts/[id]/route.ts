import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchMonitoringAlertSchema } from "@/lib/validation/monitoring-alert";
import { loadAlertLifecycleConfig } from "@/lib/alert-lifecycle-config-db";
import { deniedAlertEditFields } from "@/lib/alert-lifecycle-edit-policy";
import { validateAlertTransition } from "@/lib/alert-lifecycle-transition";

type Params = { params: Promise<{ id: string }> };

const alertInclude = { application: { select: { id: true, name: true } } } as const;

async function findAlert(id: string) {
  return (
    (await prisma.monitoringAlert.findUnique({ where: { id }, include: alertInclude })) ??
    (await prisma.monitoringAlert.findUnique({ where: { alertCode: id }, include: alertInclude }))
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
  const row = await findAlert(id);
  if (!row) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  return NextResponse.json(row);
}

/**
 * Updates allowlisted alert fields. alertCode is immutable (schema.strict).
 * Enforces lifecycle edit policy and status transitions (config-driven soft gates).
 * threshold/currentValue remain strings to support non-numeric seed values.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findAlert(id);
  if (!existing) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

  const parsed = patchMonitoringAlertSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  // Lifecycle: edit policy + status transitions (config-driven soft gates).
  try {
    const { config } = await loadAlertLifecycleConfig(user!.id);
    const proposedKeys = Object.keys(body);
    const { mode, denied } = deniedAlertEditFields(
      config,
      existing.status,
      proposedKeys
    );
    if (denied.length > 0) {
      return NextResponse.json(
        {
          error: `This alert is ${mode.replaceAll("_", "-")} in status "${existing.status}". Cannot change: ${denied.join(", ")}`,
          code: "EDIT_POLICY_DENIED",
          mode,
          denied,
        },
        { status: 409 }
      );
    }
    if (body.status !== undefined && String(body.status) !== existing.status) {
      const transition = validateAlertTransition({
        config,
        fromStatus: existing.status,
        toStatus: String(body.status),
        overrideReason: body.overrideReason ?? null,
        facts: { reason: body.overrideReason ?? null },
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
    }
  } catch (err) {
    console.error("[monitoring-alerts PATCH] lifecycle enforcement failed", {
      alertId: existing.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Alert lifecycle validation is temporarily unavailable" },
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
  if (body.alertType !== undefined) data.alertType = body.alertType;
  if (body.severity !== undefined) data.severity = body.severity;
  if (body.metric !== undefined) data.metric = body.metric;
  if (body.threshold !== undefined) data.threshold = body.threshold;
  if (body.currentValue !== undefined) data.currentValue = body.currentValue;
  if (body.status !== undefined) data.status = body.status;
  if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo;
  if (body.environmentName !== undefined) data.environmentName = body.environmentName;

  const row = await prisma.monitoringAlert.update({
    where: { id: existing.id },
    data,
    include: alertInclude,
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findAlert(id);
  if (!existing) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

  await prisma.monitoringAlert.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
