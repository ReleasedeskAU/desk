import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  calcDbReadiness,
  computeDbLifecycleStages,
  getDbNextActions,
  liveBlockersToCommandBlockers,
} from "@/lib/db-release-command";
import { predictDbRelease } from "@/lib/db-predictive";
import { prisma } from "@/lib/prisma";
import { resolveLifecycleConfigForRelease } from "@/lib/release-lifecycle-config-db";

const releaseInclude = {
  department: true,
  applications: { include: { application: true } },
  dependsOn: { include: { dependsOnRelease: true } },
  bookings: { include: { application: true } },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireRole("readonly");
  if (error) return error;

  const release = await prisma.release.findUnique({
    where: { id: id },
    include: releaseInclude,
  });
  if (!release) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let lifecycleConfig = null;
  try {
    lifecycleConfig = (
      await resolveLifecycleConfigForRelease(
        user!.id,
        release.lifecycleConfigVersionId
      )
    ).config;
  } catch {
    lifecycleConfig = null;
  }

  const [p1Issues, liveBlockerRows] = await Promise.all([
    prisma.p1Issue.findMany({
      where: { releaseCode: release.releaseCode },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.blocker.findMany({
      where: { releaseCode: release.releaseCode },
      orderBy: { sourceOrder: "asc" },
      select: {
        id: true,
        blockerCode: true,
        blockerDescription: true,
        status: true,
        severity: true,
      },
    }),
  ]);

  const blockers = liveBlockersToCommandBlockers(liveBlockerRows);
  const readiness = calcDbReadiness(
    release,
    p1Issues,
    blockers.length,
    lifecycleConfig
  );
  const stages = computeDbLifecycleStages(
    release,
    p1Issues,
    blockers,
    lifecycleConfig
  );
  const nextActions = getDbNextActions(release, blockers, lifecycleConfig);
  const prediction = predictDbRelease(
    release,
    p1Issues,
    blockers,
    lifecycleConfig
  );

  return NextResponse.json({
    readiness,
    blockers,
    stages,
    nextActions,
    p1Issues,
    prediction,
  });
}
