import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { mapDbEnvBookingRow } from "@/lib/list-api-filters";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row =
    (await prisma.envBooking.findUnique({
      where: { id },
      include: {
        application: { select: { id: true, name: true } },
        release: { select: { id: true, releaseCode: true, name: true } },
        environment: { select: { id: true, name: true, type: true } },
      },
    })) ??
    (await prisma.envBooking.findFirst({
      where: { bookingCode: id },
      include: {
        application: { select: { id: true, name: true } },
        release: { select: { id: true, releaseCode: true, name: true } },
        environment: { select: { id: true, name: true, type: true } },
      },
    }));

  if (!row) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const conflictCodes = (row.environmentConflictId ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const conflicts = conflictCodes.length
    ? await prisma.environmentConflict.findMany({
        where: { conflictCode: { in: conflictCodes } },
        select: { id: true, conflictCode: true, status: true, priority: true },
        orderBy: { sourceOrder: "asc" },
      })
    : [];

  return NextResponse.json({
    ...mapDbEnvBookingRow(row),
    conflicts,
  });
}
