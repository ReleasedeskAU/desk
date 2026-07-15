import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchPlannedMaintenanceSchema } from "@/lib/validation/planned-maintenance";

type Params = { params: Promise<{ id: string }> };

const maintenanceInclude = {
  application: { select: { id: true, name: true } },
} as const;

async function findMaintenance(id: string) {
  return (
    (await prisma.plannedMaintenance.findUnique({ where: { id }, include: maintenanceInclude })) ??
    (await prisma.plannedMaintenance.findUnique({
      where: { maintenanceCode: id },
      include: maintenanceInclude,
    }))
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
  const row = await findMaintenance(id);
  if (!row) return NextResponse.json({ error: "Maintenance record not found" }, { status: 404 });
  return NextResponse.json(row);
}

/**
 * Updates allowlisted maintenance fields. maintenanceCode is immutable (schema.strict).
 */
export async function PATCH(req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findMaintenance(id);
  if (!existing) return NextResponse.json({ error: "Maintenance record not found" }, { status: 404 });

  const parsed = patchPlannedMaintenanceSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const scheduledDate = parseDate(body.scheduledDate);
  if (body.scheduledDate !== undefined && scheduledDate === undefined) {
    return NextResponse.json({ error: "Invalid scheduledDate" }, { status: 400 });
  }

  if (body.applicationId) {
    const app = await prisma.application.findUnique({ where: { id: body.applicationId }, select: { id: true } });
    if (!app) return NextResponse.json({ error: "Application not found" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (scheduledDate !== undefined) data.scheduledDate = scheduledDate;
  if (body.startTime !== undefined) data.startTime = body.startTime;
  if (body.endTime !== undefined) data.endTime = body.endTime;
  if (body.type !== undefined) data.type = body.type;
  if (body.applicationId !== undefined) data.applicationId = body.applicationId;
  if (body.environmentName !== undefined) data.environmentName = body.environmentName;
  if (body.departmentName !== undefined) data.departmentName = body.departmentName;
  if (body.impact !== undefined) data.impact = body.impact;
  if (body.requestor !== undefined) data.requestor = body.requestor;
  if (body.approvalStatus !== undefined) data.approvalStatus = body.approvalStatus;
  if (body.notes !== undefined) data.notes = body.notes;

  const row = await prisma.plannedMaintenance.update({
    where: { id: existing.id },
    data,
    include: maintenanceInclude,
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findMaintenance(id);
  if (!existing) return NextResponse.json({ error: "Maintenance record not found" }, { status: 404 });

  await prisma.plannedMaintenance.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
