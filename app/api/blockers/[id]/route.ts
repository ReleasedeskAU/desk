import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

async function findBlocker(id: string) {
  return (
    (await prisma.blocker.findUnique({ where: { id } })) ??
    (await prisma.blocker.findUnique({ where: { blockerCode: id } }))
  );
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function optionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function optionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function mapBlocker(row: NonNullable<Awaited<ReturnType<typeof findBlocker>>>, release: {
  id: string;
  releaseCode: string;
  name: string;
  status: string;
} | null) {
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
 * Updates blocker fields. Blocker ID (blockerCode) is intentionally immutable.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findBlocker(id);
  if (!existing) return NextResponse.json({ error: "Blocker not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  for (const [bodyKey, dbKey] of [
    ["releaseCode", "releaseCode"],
    ["releaseName", "releaseName"],
    ["department", "departmentName"],
    ["application", "applicationName"],
    ["blockerType", "blockerType"],
    ["blockerDescription", "blockerDescription"],
    ["severity", "severity"],
    ["raisedBy", "raisedBy"],
    ["status", "status"],
    ["escalationLevel", "escalationLevel"],
    ["impactOnRelease", "impactOnRelease"],
  ] as const) {
    if (body[bodyKey] !== undefined) data[dbKey] = String(body[bodyKey]).trim();
  }

  const assignedTo = optionalString(body.assignedTo);
  if (assignedTo !== undefined) data.assignedTo = assignedTo;
  const rootCause = optionalString(body.rootCause);
  if (rootCause !== undefined) data.rootCause = rootCause;
  const resolutionNotes = optionalString(body.resolutionNotes);
  if (resolutionNotes !== undefined) data.resolutionNotes = resolutionNotes;

  const raisedDate = optionalDate(body.raisedDate);
  if (raisedDate !== undefined) data.raisedDate = raisedDate;
  const targetResolutionDate = optionalDate(body.targetResolutionDate);
  if (targetResolutionDate !== undefined) data.targetResolutionDate = targetResolutionDate;
  const actualResolutionDate = optionalDate(body.actualResolutionDate);
  if (actualResolutionDate !== undefined) data.actualResolutionDate = actualResolutionDate;
  const daysOpen = optionalInt(body.daysOpen);
  if (daysOpen !== undefined) data.daysOpen = daysOpen;

  const row = await prisma.blocker.update({ where: { id: existing.id }, data });
  const release = await prisma.release.findUnique({
    where: { releaseCode: row.releaseCode },
    select: { id: true, releaseCode: true, name: true, status: true },
  });

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
