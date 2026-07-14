import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

async function findConflict(id: string) {
  return (
    (await prisma.environmentConflict.findUnique({ where: { id } })) ??
    (await prisma.environmentConflict.findUnique({ where: { conflictCode: id } }))
  );
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row = await findConflict(id);

  if (!row) return NextResponse.json({ error: "Conflict not found" }, { status: 404 });

  const [releases, bookings] = await Promise.all([
    prisma.release.findMany({
      where: { releaseCode: { in: [row.release1Code, row.release2Code] } },
      select: { id: true, releaseCode: true, name: true },
    }),
    prisma.envBooking.findMany({
      where: {
        OR: [
          { environmentConflictId: row.conflictCode },
          { environmentConflictId: { contains: row.conflictCode } },
        ],
      },
      select: {
        id: true,
        bookingCode: true,
        departmentName: true,
        conflictFlag: true,
        application: { select: { name: true } },
        release: { select: { id: true, releaseCode: true } },
      },
      orderBy: { sourceOrder: "asc" },
    }),
  ]);

  const byCode = new Map(releases.map((r) => [r.releaseCode, r]));

  return NextResponse.json({
    id: row.id,
    conflictCode: row.conflictCode,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assignedTo ?? "",
    release1Code: row.release1Code,
    release2Code: row.release2Code,
    release1: byCode.get(row.release1Code) ?? null,
    release2: byCode.get(row.release2Code) ?? null,
    application: row.applicationName,
    department: row.departmentName,
    conflictingEnvironment: row.conflictingEnvironment,
    environmentConflictType: row.environmentConflictType,
    notes: row.notes,
    relatedBookings: bookings.map((b) => ({
      id: b.id,
      bookingCode: b.bookingCode,
      application: b.application.name,
      department: b.departmentName,
      conflictFlag: b.conflictFlag,
      release: b.release,
    })),
  });
}

/**
 * Updates mutable conflict fields. Conflict ID (conflictCode) is intentionally immutable.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findConflict(id);
  if (!existing) return NextResponse.json({ error: "Conflict not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.status !== undefined) data.status = String(body.status);
  if (body.priority !== undefined) data.priority = String(body.priority);
  if (body.release1Code !== undefined) data.release1Code = String(body.release1Code).trim();
  if (body.release2Code !== undefined) data.release2Code = String(body.release2Code).trim();
  if (body.application !== undefined) data.applicationName = String(body.application).trim();
  if (body.department !== undefined) data.departmentName = String(body.department).trim();
  if (body.conflictingEnvironment !== undefined) {
    data.conflictingEnvironment = String(body.conflictingEnvironment).trim();
  }
  if (body.environmentConflictType !== undefined) {
    data.environmentConflictType = String(body.environmentConflictType).trim();
  }
  const assignedTo = optionalString(body.assignedTo);
  if (assignedTo !== undefined) data.assignedTo = assignedTo;
  const notes = optionalString(body.notes);
  if (notes !== undefined) data.notes = notes;

  const row = await prisma.environmentConflict.update({
    where: { id: existing.id },
    data,
  });

  return NextResponse.json({ id: row.id, conflictCode: row.conflictCode });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findConflict(id);
  if (!existing) return NextResponse.json({ error: "Conflict not found" }, { status: 404 });

  await prisma.environmentConflict.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
