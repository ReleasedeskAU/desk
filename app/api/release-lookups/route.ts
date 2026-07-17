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
import { ensureDbAwake, isRetryableDbError, prisma, withDbRetry } from "@/lib/prisma";

/** Neon cold starts on Vercel can exceed the default 10s hobby limit. */
export const maxDuration = 60;

/** One request, sequential DB queries — avoids Neon pool exhaustion from 6 parallel API routes. */
export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  try {
    const params = sp(req);

    // Best-effort wake — do not hard-fail; withDbRetry still handles cold starts.
    await ensureDbAwake();

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
    const transient = isRetryableDbError(err);
    return NextResponse.json(
      { error: transient ? "Database temporarily unavailable" : "Failed to load release lookups" },
      { status: transient ? 503 : 500, headers: transient ? { "Retry-After": "3" } : undefined }
    );
  }
}
