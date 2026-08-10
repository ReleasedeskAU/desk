import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { driftWhere, sp } from "@/lib/list-api-filters";
import { zodErrorResponse } from "@/lib/api-errors";
import { createDriftSchema } from "@/lib/validation/drift";
import { createDriftRow } from "@/lib/org-compat";

async function nextDriftCode(): Promise<string> {
  const rows = await prisma.drift.findMany({ select: { driftCode: true } });
  const next = rows.reduce((max, row) => {
    const match = row.driftCode.match(/^DFT-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  return `DFT-${String(next).padStart(3, "0")}`;
}

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.drift.findMany({
    where: driftWhere(sp(req)),
    include: {
      release: { select: { id: true, releaseCode: true, name: true, status: true } },
      application: { select: { id: true, name: true } },
    },
    orderBy: { sourceOrder: "asc" },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = createDriftSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  // driftType is a fixed master-data set (ReferenceData category="drift_type"),
  // not free text — reject anything not in the active lookup list.
  const validDriftType = await prisma.referenceData.findUnique({
    where: { category_value: { category: "drift_type", value: body.driftType } },
  });
  if (!validDriftType || !validDriftType.active) {
    return NextResponse.json({ error: "Invalid driftType — must be an active Drift Type reference value" }, { status: 400 });
  }

  const [release, application, environment, maxOrder] = await Promise.all([
    prisma.release.findUnique({
      where: { id: body.releaseId },
      select: {
        id: true,
        departmentId: true,
        applications: { where: { applicationId: body.applicationId }, select: { applicationId: true } },
      },
    }),
    prisma.application.findUnique({
      where: { id: body.applicationId },
      select: { id: true, department: { select: { id: true, name: true } } },
    }),
    prisma.environment.findUnique({
      where: {
        applicationId_name: { applicationId: body.applicationId, name: body.environmentName },
      },
      select: { id: true },
    }),
    prisma.drift.aggregate({ _max: { sourceOrder: true } }),
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
    return NextResponse.json({ error: "Environment is not linked to the selected application" }, { status: 400 });
  }

  const row = await createDriftRow({
    driftCode: await nextDriftCode(),
    releaseId: body.releaseId,
    applicationId: body.applicationId,
    departmentName: application.department.name,
    environmentName: body.environmentName,
    driftType: body.driftType,
    driftCategory: body.driftCategory ?? null,
    detectedDate: new Date(body.detectedDate),
    severity: body.severity,
    description: body.description,
    impactOnRelease: body.impactOnRelease ?? null,
    remediationAction: body.remediationAction ?? null,
    status: body.status ?? "Detected",
    etaToFix: body.etaToFix ? new Date(body.etaToFix) : null,
    sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
  });
  return NextResponse.json(row, { status: 201 });
}
