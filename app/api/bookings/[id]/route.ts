import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { mapDbEnvBookingRow } from "@/lib/list-api-filters";
import { patchBookingSchema } from "@/lib/validation/booking";
import { jsonError, zodErrorResponse } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

const bookingInclude = {
  application: { select: { id: true, name: true } },
  release: { select: { id: true, releaseCode: true, name: true } },
  environment: { select: { id: true, name: true, type: true } },
} as const;

async function findBooking(id: string) {
  return (
    (await prisma.envBooking.findUnique({ where: { id }, include: bookingInclude })) ??
    (await prisma.envBooking.findFirst({ where: { bookingCode: id }, include: bookingInclude }))
  );
}

async function withConflicts(row: NonNullable<Awaited<ReturnType<typeof findBooking>>>) {
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

  return {
    ...mapDbEnvBookingRow(row),
    conflicts,
  };
}

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setHours(0, 0, 0, 0);
  return d;
}

function spanDays(start: Date | null | undefined, end: Date | null | undefined): number | null {
  if (!start || !end) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
}

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row = await findBooking(id);
  if (!row) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  return NextResponse.json(await withConflicts(row));
}

/** Update allowlisted booking fields (editor+). */
export async function PATCH(req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findBooking(id);
  if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const parsed = patchBookingSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const testStart = parseDate(body.testStart);
  const testEnd = parseDate(body.testEnd);
  const uatStart = parseDate(body.uatStart);
  const uatEnd = parseDate(body.uatEnd);
  const preProdStart = parseDate(body.preProdStart);
  const preProdEnd = parseDate(body.preProdEnd);
  const prodReleaseDate = parseDate(body.prodReleaseDate);
  const cabDate = parseDate(body.cabDate);

  // Invalid date strings → 400 (undefined from parseDate means bad input when key was present)
  const dateKeys = [
    ["testStart", body.testStart, testStart],
    ["testEnd", body.testEnd, testEnd],
    ["uatStart", body.uatStart, uatStart],
    ["uatEnd", body.uatEnd, uatEnd],
    ["preProdStart", body.preProdStart, preProdStart],
    ["preProdEnd", body.preProdEnd, preProdEnd],
    ["prodReleaseDate", body.prodReleaseDate, prodReleaseDate],
    ["cabDate", body.cabDate, cabDate],
  ] as const;
  for (const [key, raw, parsedDate] of dateKeys) {
    if (raw !== undefined && raw !== null && parsedDate === undefined) {
      return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
    }
  }

  const nextTestStart = testStart !== undefined ? testStart : existing.testStart;
  const nextTestEnd = testEnd !== undefined ? testEnd : existing.testEnd;
  const nextUatStart = uatStart !== undefined ? uatStart : existing.uatStart;
  const nextUatEnd = uatEnd !== undefined ? uatEnd : existing.uatEnd;
  const nextPreStart = preProdStart !== undefined ? preProdStart : existing.preProdStart;
  const nextPreEnd = preProdEnd !== undefined ? preProdEnd : existing.preProdEnd;

  if (nextTestStart && nextTestEnd && nextTestEnd < nextTestStart) {
    return NextResponse.json({ error: "Test end must be on or after test start" }, { status: 400 });
  }
  if (nextUatStart && nextUatEnd && nextUatEnd < nextUatStart) {
    return NextResponse.json({ error: "UAT end must be on or after UAT start" }, { status: 400 });
  }
  if (nextPreStart && nextPreEnd && nextPreEnd < nextPreStart) {
    return NextResponse.json({ error: "Pre-Prod end must be on or after Pre-Prod start" }, { status: 400 });
  }

  if (body.releaseId) {
    const release = await prisma.release.findUnique({
      where: { id: body.releaseId },
      select: { id: true },
    });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  try {
    const row = await prisma.envBooking.update({
      where: { id: existing.id },
      data: {
        ...(body.releaseId !== undefined ? { releaseId: body.releaseId } : {}),
        ...(body.purpose !== undefined ? { purpose: body.purpose } : {}),
        ...(body.dependencies !== undefined ? { dependencies: body.dependencies } : {}),
        ...(body.releaseSize !== undefined ? { releaseSize: body.releaseSize } : {}),
        ...(prodReleaseDate !== undefined ? { prodReleaseDate } : {}),
        ...(cabDate !== undefined ? { cabDate } : {}),
        ...(body.testEnvCode !== undefined ? { testEnvCode: body.testEnvCode } : {}),
        ...(testStart !== undefined ? { testStart, fromDate: testStart ?? existing.fromDate } : {}),
        ...(testEnd !== undefined ? { testEnd, toDate: testEnd ?? existing.toDate } : {}),
        ...(body.uatEnvCode !== undefined ? { uatEnvCode: body.uatEnvCode } : {}),
        ...(uatStart !== undefined ? { uatStart } : {}),
        ...(uatEnd !== undefined ? { uatEnd } : {}),
        ...(body.preProdEnvCode !== undefined ? { preProdEnvCode: body.preProdEnvCode } : {}),
        ...(preProdStart !== undefined ? { preProdStart } : {}),
        ...(preProdEnd !== undefined ? { preProdEnd } : {}),
        ...(body.conflictFlag !== undefined ? { conflictFlag: body.conflictFlag } : {}),
        ...(body.environmentConflictId !== undefined
          ? { environmentConflictId: body.environmentConflictId }
          : {}),
        testDays: spanDays(nextTestStart, nextTestEnd),
        uatDays: spanDays(nextUatStart, nextUatEnd),
        preProdDays: spanDays(nextPreStart, nextPreEnd),
      },
      include: bookingInclude,
    });

    return NextResponse.json(await withConflicts(row));
  } catch (err) {
    return jsonError(err, {
      publicMessage: "Failed to update booking",
      status: 500,
      logLabel: "api/bookings/[id] PATCH",
    });
  }
}

/** Delete a booking (editor+). */
export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findBooking(id);
  if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  try {
    await prisma.envBooking.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err, {
      publicMessage: "Failed to delete booking",
      status: 500,
      logLabel: "api/bookings/[id] DELETE",
    });
  }
}
