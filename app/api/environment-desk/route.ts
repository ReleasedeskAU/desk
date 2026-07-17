import { NextResponse } from "next/server";
import type { Prisma } from "@releasedesk/database";
import { requireRole } from "@/lib/auth/api";
import { buildBookings, buildTimeline, buildVersionMatrix } from "@/lib/db-environment-desk";
import { prisma } from "@/lib/prisma";
import { environmentVersionOrderBy, sp, str, dateTextRange } from "@/lib/list-api-filters";

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const params = sp(req);
  const appId = str(params, "app");
  const deptId = str(params, "dept");
  const envName = str(params, "env");
  const status = str(params, "status");
  const versionQ = str(params, "version");
  const envOwnerQ = str(params, "envOwner");
  const buildQ = str(params, "build");
  const deployDateQ = str(params, "deployDate");
  const deployedByQ = str(params, "deployedBy");
  const notesQ = str(params, "notes");

  const and: Prisma.EnvironmentVersionWhereInput[] = [];
  if (appId) and.push({ applicationId: appId });
  if (deptId) and.push({ application: { departmentId: deptId } });
  if (envName) {
    and.push({
      environment: {
        OR: [
          { name: { equals: envName, mode: "insensitive" } },
          { type: { equals: envName, mode: "insensitive" } },
        ],
      },
    });
  }
  if (envOwnerQ) {
    and.push({ environment: { owner: { contains: envOwnerQ, mode: "insensitive" } } });
  }
  if (status) and.push({ status });
  if (versionQ) and.push({ version: { contains: versionQ, mode: "insensitive" } });
  if (buildQ) and.push({ buildNumber: { contains: buildQ, mode: "insensitive" } });
  if (deployedByQ) and.push({ updatedBy: { contains: deployedByQ, mode: "insensitive" } });
  if (notesQ) and.push({ notes: { contains: notesQ, mode: "insensitive" } });

  if (deployDateQ) {
    const range = dateTextRange(deployDateQ);
    if (range) and.push({ deployDate: range });
  }

  const versionWhere: Prisma.EnvironmentVersionWhereInput | undefined =
    and.length === 0 ? undefined : and.length === 1 ? and[0] : { AND: and };

  const [apps, versions, releases, bookings, edges, environments, departments] = await Promise.all([
    prisma.application.findMany({ include: { department: true, environments: true } }),
    prisma.environmentVersion.findMany({
      where: versionWhere,
      orderBy: environmentVersionOrderBy(params),
      include: { environment: true, application: { include: { department: true } } },
    }),
    prisma.release.findMany({ include: { department: true }, orderBy: { releaseDate: "asc" } }),
    prisma.envBooking.findMany({ include: { application: true }, orderBy: { fromDate: "asc" } }),
    prisma.systemMappingEdge.findMany({
      include: { sourceApp: true, sourceEnv: true, targetApp: true, targetEnv: true },
    }),
    prisma.environment.findMany({ include: { application: true } }),
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const versionMatrix = buildVersionMatrix(apps, versions, releases);
  const timeline = buildTimeline(releases);
  const bookingRows = buildBookings(bookings);
  const driftCount = versionMatrix.filter((v) => v.drift).length;

  return NextResponse.json({
    versionMatrix,
    versions,
    timeline,
    bookings: bookingRows,
    edges,
    environments,
    applications: apps,
    departments,
    stats: {
      activeReleases: releases.filter((r) => r.status === "In Progress" || r.status === "At Risk").length,
      bookedEnvs: bookings.length,
      driftApps: driftCount,
      mappingEdges: edges.length,
    },
    alerts: [
      ...(driftCount > 0
        ? [{
            id: "drift",
            severity: "medium" as const,
            title: `${driftCount} application(s) with promotion drift`,
            detail: "DEV/TEST versions differ from PROD — review promotion matrix.",
            href: "/environments",
            actionLabel: "View matrix",
          }]
        : []),
      ...(releases.some((r) => r.status === "At Risk")
        ? [{
            id: "at-risk",
            severity: "high" as const,
            title: "Release at risk",
            detail: "One or more releases flagged At Risk in the current train.",
            href: "/releases",
            actionLabel: "View releases",
          }]
        : []),
    ],
  });
}
