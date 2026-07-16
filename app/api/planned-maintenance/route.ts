import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { plannedMaintenanceWhere, sp } from "@/lib/list-api-filters";
import { zodErrorResponse } from "@/lib/api-errors";
import { createPlannedMaintenanceSchema } from "@/lib/validation/planned-maintenance";

const maintenanceInclude = {
  application: { select: { id: true, name: true } },
} as const;

async function nextMaintenanceCode(): Promise<string> {
  const rows = await prisma.plannedMaintenance.findMany({ select: { maintenanceCode: true } });
  const next = rows.reduce((max, row) => {
    const match = row.maintenanceCode.match(/^MNT-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  return `MNT-${String(next).padStart(3, "0")}`;
}

/** Read-only for this pass — seeded maintenance calendar data. */
export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.plannedMaintenance.findMany({
    where: plannedMaintenanceWhere(sp(req)),
    include: maintenanceInclude,
    orderBy: { sourceOrder: "asc" },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = createPlannedMaintenanceSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  const scheduledDate = new Date(`${body.scheduledDate}T00:00:00.000Z`);
  if (Number.isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: "Invalid scheduledDate" }, { status: 400 });
  }

  const [application, maxOrder] = await Promise.all([
    body.applicationId
      ? prisma.application.findUnique({
          where: { id: body.applicationId },
          select: { id: true, department: { select: { name: true } } },
        })
      : Promise.resolve(null),
    prisma.plannedMaintenance.aggregate({ _max: { sourceOrder: true } }),
  ]);
  if (body.applicationId && !application) {
    return NextResponse.json({ error: "Application not found" }, { status: 400 });
  }

  const row = await prisma.plannedMaintenance.create({
    data: {
      maintenanceCode: await nextMaintenanceCode(),
      scheduledDate,
      startTime: body.startTime,
      endTime: body.endTime,
      type: body.type,
      applicationId: body.applicationId ?? null,
      environmentName: body.environmentName,
      departmentName: body.departmentName ?? application?.department.name ?? null,
      impact: body.impact,
      requestor: body.requestor ?? null,
      approvalStatus: body.approvalStatus,
      notes: body.notes ?? null,
      sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
    },
    include: maintenanceInclude,
  });
  return NextResponse.json(row, { status: 201 });
}
