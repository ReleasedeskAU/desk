import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row =
    (await prisma.blocker.findUnique({ where: { id } })) ??
    (await prisma.blocker.findUnique({ where: { blockerCode: id } }));

  if (!row) return NextResponse.json({ error: "Blocker not found" }, { status: 404 });

  const release = await prisma.release.findUnique({
    where: { releaseCode: row.releaseCode },
    select: { id: true, releaseCode: true, name: true, status: true },
  });

  return NextResponse.json({
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
  });
}
