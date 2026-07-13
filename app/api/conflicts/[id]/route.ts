import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row =
    (await prisma.environmentConflict.findUnique({ where: { id } })) ??
    (await prisma.environmentConflict.findUnique({ where: { conflictCode: id } }));

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
