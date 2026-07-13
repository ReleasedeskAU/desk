import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { driftWhere, sp } from "@/lib/list-api-filters";

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

  const body = await req.json();

  // driftType is a fixed master-data set (ReferenceData category="drift_type"),
  // not free text — reject anything not in the active lookup list.
  const validDriftType = await prisma.referenceData.findUnique({
    where: { category_value: { category: "drift_type", value: body.driftType } },
  });
  if (!validDriftType || !validDriftType.active) {
    return NextResponse.json({ error: "Invalid driftType — must be an active Drift Type reference value" }, { status: 400 });
  }

  const row = await prisma.drift.create({
    data: {
      driftCode: body.driftCode,
      releaseId: body.releaseId,
      applicationId: body.applicationId,
      environmentName: body.environmentName,
      driftType: body.driftType,
      driftCategory: body.driftCategory ?? null,
      detectedDate: new Date(body.detectedDate),
      severity: body.severity,
      description: body.description,
      impactOnRelease: body.impactOnRelease ?? null,
      remediationAction: body.remediationAction ?? null,
      status: body.status ?? "Open",
      etaToFix: body.etaToFix ? new Date(body.etaToFix) : null,
    },
    include: {
      release: { select: { id: true, releaseCode: true, name: true } },
      application: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(row, { status: 201 });
}
