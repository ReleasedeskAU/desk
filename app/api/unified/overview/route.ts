import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  parseReleaseFilters,
  prismaReleaseWhere,
} from "@/lib/db-release-filter";
import { buildBookings, buildVersionMatrix } from "@/lib/db-environment-desk";
import { toLegacyConnectorSummary } from "@/lib/connectors/public";
import { prisma } from "@/lib/prisma";
import { countByStatus, dbToUnified, periodRange, type Period } from "@/lib/unified-releases";
import { loadReleaseLifecycleConfig } from "@/lib/release-lifecycle-config-db";

export async function GET(req: Request) {
  const { user, error } = await requireRole("readonly");
  if (error) return error;

  const period = (new URL(req.url).searchParams.get("period") ?? "month") as Period;
  const filters = parseReleaseFilters(req);
  const { start, end } = periodRange(period);

  const [departments, applications, environments] = await Promise.all([
    prisma.department.findMany(),
    prisma.application.findMany(),
    prisma.environment.findMany({ include: { application: true } }),
  ]);

  const dbWhere = prismaReleaseWhere(filters, {
    releaseDate: { gte: start, lte: end },
  });

  const appFilter = filters.applicationId
    ? applications.find((a) => a.id === filters.applicationId)
    : null;

  const [dbReleases, bookings, apps, versions, connectorRows, p1Issues] = await Promise.all([
    prisma.release.findMany({
      where: dbWhere,
      include: {
        department: true,
        applications: { include: { application: true } },
        bookings: { include: { environment: true, application: true } },
        dependsOn: { include: { dependsOnRelease: true } },
      },
      orderBy: { releaseDate: "asc" },
    }),
    prisma.envBooking.findMany({ include: { application: true }, orderBy: { fromDate: "asc" }, take: 8 }),
    prisma.application.findMany({ include: { department: true, environments: true } }),
    prisma.environmentVersion.findMany({ include: { environment: true, application: { include: { department: true } } } }),
    prisma.connector.findMany({
      where: { enabled: true },
      orderBy: { name: "asc" },
      select: { name: true, lastSyncedAt: true },
    }),
    prisma.p1Issue.findMany({
      where: {
        priority: "P1",
        ...(appFilter ? { application: appFilter.name } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  const connectors = toLegacyConnectorSummary(connectorRows);

  let lifecycleConfig = null;
  try {
    lifecycleConfig = (await loadReleaseLifecycleConfig(user!.id)).config;
  } catch {
    lifecycleConfig = null;
  }

  const dbUnified = dbReleases.map(dbToUnified);
  const combined = dbUnified;
  const combinedCounts = countByStatus(combined, lifecycleConfig);
  const dbCounts = combinedCounts;
  const versionMatrix = buildVersionMatrix(apps, versions, dbReleases);
  const driftApps = versionMatrix.filter((v) => v.drift).length;

  return NextResponse.json({
    period,
    range: { start, end },
    counts: {
      combined: combinedCounts,
      database: dbCounts,
    },
    releases: combined.slice(0, 20),
    bookings: buildBookings(bookings),
    connectors,
    p1Issues,
    environment: {
      driftApps,
      bookedEnvs: bookings.length,
      applications: apps.length,
    },
    links: [
      { label: "Environment desk", href: "/environments" },
      { label: "Env booking", href: "/booking" },
      { label: "System mapping", href: "/system-mapping" },
    ],
  });
}
