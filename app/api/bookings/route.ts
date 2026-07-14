import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { checkBookingAvailability } from "@/lib/booking";
import { createEnvBookingRow } from "@/lib/org-compat";
import { prisma } from "@/lib/prisma";
import { bookingWhere, mapDbEnvBookingRow, sp } from "@/lib/list-api-filters";
import { jsonError } from "@/lib/api-errors";

/** Availability check only (readonly+). */
export async function POST(req: Request) {
  const { user, error } = await requireRole("readonly");
  if (error) return error;

  const body = await req.json();
  const applicationIds: string[] = body.applicationIds ?? [];
  const fromDate = new Date(body.fromDate);
  const toDate = new Date(body.toDate);

  if (!applicationIds.length || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "applicationIds, fromDate, and toDate are required" }, { status: 400 });
  }

  const result = await checkBookingAvailability(applicationIds, fromDate, toDate);
  return NextResponse.json({ ...result, checkedBy: user!.email });
}

/** Create booking(s) — editor/admin. Reuses checkBookingAvailability for conflicts. */
export async function PUT(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  try {
    const body = await req.json();
    const applicationIds: string[] = body.applicationIds ?? [];
    const fromDate = new Date(body.fromDate);
    const toDate = new Date(body.toDate);
    const environmentId: string | undefined = body.environmentId || undefined;
    const releaseId: string | undefined = body.releaseId || undefined;
    const purpose: string | undefined = body.purpose || undefined;
    const teamOverride: string | undefined = body.team || undefined;
    const uatEnvCode: string | undefined = body.uatEnvCode || undefined;
    const uatStart = body.uatStart ? new Date(body.uatStart) : null;
    const uatEnd = body.uatEnd ? new Date(body.uatEnd) : null;
    const preProdEnvCode: string | undefined = body.preProdEnvCode || undefined;
    const preProdStart = body.preProdStart ? new Date(body.preProdStart) : null;
    const preProdEnd = body.preProdEnd ? new Date(body.preProdEnd) : null;

    if (!applicationIds.length || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return NextResponse.json({ error: "applicationIds, fromDate, and toDate are required" }, { status: 400 });
    }
    if (!environmentId) {
      return NextResponse.json({ error: "environmentId is required" }, { status: 400 });
    }
    if (!releaseId) {
      return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
    }
    if (toDate < fromDate) {
      return NextResponse.json({ error: "toDate must be on or after fromDate" }, { status: 400 });
    }
    if (uatStart && Number.isNaN(uatStart.getTime())) {
      return NextResponse.json({ error: "Invalid uatStart" }, { status: 400 });
    }
    if (uatEnd && Number.isNaN(uatEnd.getTime())) {
      return NextResponse.json({ error: "Invalid uatEnd" }, { status: 400 });
    }
    if (uatStart && uatEnd && uatEnd < uatStart) {
      return NextResponse.json({ error: "uatEnd must be on or after uatStart" }, { status: 400 });
    }
    if (preProdStart && Number.isNaN(preProdStart.getTime())) {
      return NextResponse.json({ error: "Invalid preProdStart" }, { status: 400 });
    }
    if (preProdEnd && Number.isNaN(preProdEnd.getTime())) {
      return NextResponse.json({ error: "Invalid preProdEnd" }, { status: 400 });
    }
    if (preProdStart && preProdEnd && preProdEnd < preProdStart) {
      return NextResponse.json({ error: "preProdEnd must be on or after preProdStart" }, { status: 400 });
    }

    const check = await checkBookingAvailability(applicationIds, fromDate, toDate);
    if (!check.available) {
      return NextResponse.json({ error: "Not available", conflicts: check.conflicts }, { status: 409 });
    }

    const apps = await prisma.application.findMany({
      where: { id: { in: applicationIds } },
      include: { department: true, environments: true },
    });

    if (!apps.length) {
      return NextResponse.json({ error: "No matching applications" }, { status: 400 });
    }

    const existingCodes = await prisma.envBooking.findMany({
      where: { bookingCode: { not: null } },
      select: { bookingCode: true },
    });
    let nextNum =
      existingCodes
        .map((r) => Number(String(r.bookingCode ?? "").replace(/^ENV-/i, "")))
        .filter((n) => Number.isFinite(n))
        .reduce((max, n) => Math.max(max, n), 0) + 1;

    const dayMs = 24 * 60 * 60 * 1000;
    const spanDays = (start: Date, end: Date) =>
      Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
    const testDays = spanDays(fromDate, toDate);
    const uatDays = uatStart && uatEnd ? spanDays(uatStart, uatEnd) : null;
    const preProdDays = preProdStart && preProdEnd ? spanDays(preProdStart, preProdEnd) : null;

    const created = [];
    for (const app of apps) {
      const env = app.environments.find((e) => e.id === environmentId);
      if (!env) {
        return NextResponse.json({ error: "Environment not found for application" }, { status: 400 });
      }
      const bookingCode = `ENV-${String(nextNum++).padStart(4, "0")}`;
      const team = teamOverride?.trim() || app.department.name;

      created.push(
        await createEnvBookingRow({
          bookingCode,
          applicationId: app.id,
          environmentId: env.id,
          bookedBy: user!.name,
          team,
          departmentName: app.department.name,
          fromDate,
          toDate,
          purpose: purpose ?? "End-to-end test window",
          releaseId,
          status: "BOOKED",
          conflictFlag: false,
          testEnvCode: env.name,
          testStart: fromDate,
          testEnd: toDate,
          testDays,
          uatEnvCode: uatEnvCode ?? null,
          uatStart,
          uatEnd,
          uatDays,
          preProdEnvCode: preProdEnvCode ?? null,
          preProdStart,
          preProdEnd,
          preProdDays,
        }),
      );
    }

    return NextResponse.json({ bookings: created.map(mapDbEnvBookingRow) }, { status: 201 });
  } catch (err) {
    return jsonError(err, {
      publicMessage: "Create failed",
      status: 500,
      logLabel: "api/bookings PUT",
    });
  }
}

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const params = sp(req);
  const rows = await prisma.envBooking.findMany({
    where: bookingWhere(params),
    include: {
      application: { include: { department: true } },
      release: { select: { id: true, releaseCode: true } },
    },
    orderBy: { sourceOrder: "asc" },
  });

  return NextResponse.json(rows.map(mapDbEnvBookingRow));
}
