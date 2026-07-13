import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  applicationOrderBy,
  applicationWhere,
  bookingWhere,
  calendarEventWhere,
  departmentOrderBy,
  departmentWhere,
  mapDbEnvBookingRow,
  releaseListOrderBy,
  releaseListWhere,
  sp,
} from "@/lib/list-api-filters";
import { ensureDbAwake, prisma, withDbRetry } from "@/lib/prisma";

/** One request, sequential DB queries — avoids Neon pool exhaustion from 6 parallel API routes. */
export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  try {
    const params = sp(req);

    // Wake Neon compute before the multi-query fan-out (cold start → P1001 otherwise).
    const awake = await ensureDbAwake();
    if (!awake) {
      return NextResponse.json(
        { error: "Database temporarily unavailable. Retrying shortly." },
        { status: 503, headers: { "Retry-After": "3" } }
      );
    }

    const departments = await withDbRetry(
      () =>
        prisma.department.findMany({
          where: departmentWhere(params),
          orderBy: departmentOrderBy(params),
          select: { id: true, name: true },
        }),
      { label: "release-lookups/departments" }
    );

    const applications = await withDbRetry(
      () =>
        prisma.application.findMany({
          where: applicationWhere(params),
          orderBy: applicationOrderBy(params),
          select: { id: true, name: true, departmentId: true },
        }),
      { label: "release-lookups/applications" }
    );

    const environments = await withDbRetry(
      () =>
        prisma.environment.findMany({
          include: { application: { select: { id: true, name: true } } },
          orderBy: { name: "asc" },
        }),
      { label: "release-lookups/environments" }
    );

    const bookings = (
      await withDbRetry(
        () =>
          prisma.envBooking.findMany({
            where: bookingWhere(params),
            include: {
              application: { include: { department: true } },
              release: { select: { id: true, releaseCode: true } },
            },
            orderBy: { bookingCode: "asc" },
          }),
        { label: "release-lookups/bookings" }
      )
    ).map(mapDbEnvBookingRow);

    const releaseRows = await withDbRetry(
      () =>
        prisma.release.findMany({
          where: releaseListWhere(params),
          include: {
            department: true,
            applications: { include: { application: true } },
            dependsOn: { include: { dependsOnRelease: true } },
            stakeholders: { include: { user: true } },
            releaseOwner: { select: { id: true, userId: true, name: true } },
          },
          orderBy: releaseListOrderBy(params),
        }),
      { label: "release-lookups/releases" }
    );
    const releases = releaseRows;

    const calendarEvents = await withDbRetry(
      () =>
        prisma.calendarEvent.findMany({
          where: calendarEventWhere(params),
          include: {
            release: { select: { releaseCode: true, status: true } },
          },
          orderBy: { date: "asc" },
        }),
      { label: "release-lookups/calendarEvents" }
    );

    return NextResponse.json({
      departments,
      applications,
      environments,
      bookings,
      releases,
      calendarEvents,
    });
  } catch (err) {
    console.error("release-lookups failed:", err);
    const msg = err instanceof Error ? err.message : "";
    const transient =
      msg.toLowerCase().includes("can't reach database") ||
      msg.toLowerCase().includes("timed out") ||
      msg.toLowerCase().includes("not yet connected") ||
      msg.toLowerCase().includes("engine is not yet connected") ||
      (err as { code?: string })?.code === "P1001";
    return NextResponse.json(
      { error: transient ? "Database temporarily unavailable" : "Failed to load release lookups" },
      { status: transient ? 503 : 500, headers: transient ? { "Retry-After": "3" } : undefined }
    );
  }
}
