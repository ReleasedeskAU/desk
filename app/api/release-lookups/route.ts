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
import { parseLookupInclude } from "@/lib/release-lookup-scope";
import { ensureDbAwake, isRetryableDbError, prisma, withDbRetry } from "@/lib/prisma";

/** Neon cold starts on Vercel can exceed the default 10s hobby limit. */
export const maxDuration = 60;

/**
 * Directory + optional list payloads for filters/calendar/releases.
 * `include` (comma-separated) skips unused slices so dashboard/inbox do not
 * load every release. Omitted include stays full for older callers.
 */
export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  try {
    const params = sp(req);
    const include = parseLookupInclude(params.get("include"));
    // Do not let include leak into list filters.
    params.delete("include");

    await ensureDbAwake();

    const [departments, applications, environments, bookingRows, releases, calendarEvents] =
      await Promise.all([
        include.directories
          ? withDbRetry(
              () =>
                prisma.department.findMany({
                  where: departmentWhere(params),
                  orderBy: departmentOrderBy(params),
                  select: { id: true, name: true },
                }),
              { label: "release-lookups/departments" }
            )
          : Promise.resolve([]),
        include.directories
          ? withDbRetry(
              () =>
                prisma.application.findMany({
                  where: applicationWhere(params),
                  orderBy: applicationOrderBy(params),
                  select: { id: true, name: true, departmentId: true },
                }),
              { label: "release-lookups/applications" }
            )
          : Promise.resolve([]),
        include.directories
          ? withDbRetry(
              () =>
                prisma.environment.findMany({
                  include: { application: { select: { id: true, name: true } } },
                  orderBy: { name: "asc" },
                }),
              { label: "release-lookups/environments" }
            )
          : Promise.resolve([]),
        include.bookings
          ? withDbRetry(
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
          : Promise.resolve([]),
        include.releases
          ? withDbRetry(
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
            )
          : Promise.resolve([]),
        include.calendar
          ? withDbRetry(
              () =>
                prisma.calendarEvent.findMany({
                  where: calendarEventWhere(params),
                  include: {
                    release: { select: { releaseCode: true, status: true } },
                  },
                  orderBy: { date: "asc" },
                }),
              { label: "release-lookups/calendarEvents" }
            )
          : Promise.resolve([]),
      ]);

    return NextResponse.json({
      departments,
      applications,
      environments,
      bookings: bookingRows.map(mapDbEnvBookingRow),
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
