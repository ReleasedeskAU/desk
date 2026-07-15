import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchIncidentSchema } from "@/lib/validation/incident";

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
 */
export async function PATCH(req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
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
  if (body.status !== undefined) data.status = body.status;
  if (body.impact !== undefined) data.impact = body.impact;
  if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo;
  if (body.relatedReleaseCode !== undefined) data.relatedReleaseCode = body.relatedReleaseCode;
  if (body.environmentName !== undefined) data.environmentName = body.environmentName;

  const row = await prisma.incident.update({
    where: { id: existing.id },
    data,
    include: incidentInclude,
  });
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
