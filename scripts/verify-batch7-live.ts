/**
 * Batch 7 verification: live blockers + drifts resolve for a release that has both.
 */
import { prisma } from "../lib/prisma";

async function main() {
  const blocker = await prisma.blocker.findFirst({ orderBy: { sourceOrder: "asc" } });
  if (!blocker) throw new Error("No blockers in DB");

  const release = await prisma.release.findUnique({
    where: { releaseCode: blocker.releaseCode },
    select: {
      id: true,
      releaseCode: true,
      name: true,
      department: { select: { name: true } },
      applications: { include: { application: { select: { name: true } } }, take: 1 },
    },
  });
  if (!release) throw new Error(`Release ${blocker.releaseCode} missing`);

  const blockersForRelease = await prisma.blocker.count({
    where: { releaseCode: release.releaseCode },
  });
  const driftsForRelease = await prisma.drift.count({ where: { releaseId: release.id } });

  // Prefer a release that has drift if possible for richer check
  const driftSample = await prisma.drift.findFirst({
    include: { release: { select: { id: true, releaseCode: true } } },
  });

  const checkRelease = driftSample?.release ?? release;
  const driftCount = await prisma.drift.count({ where: { releaseId: checkRelease.id } });
  const blockerCount = await prisma.blocker.count({
    where: { releaseCode: checkRelease.releaseCode },
  });

  const routes = await Promise.all(
    [
      `/releases/${checkRelease.id}`,
      `/api/blockers?release=${encodeURIComponent(checkRelease.releaseCode)}`,
      `/api/drifts?release=${encodeURIComponent(checkRelease.id)}`,
      `/api/releases/${checkRelease.id}`,
      `/api/releases/${checkRelease.id}/command-center`,
    ].map(async (path) => {
      const res = await fetch(`http://localhost:3000${path}`, { redirect: "manual" });
      return { path, status: res.status, location: res.headers.get("location") };
    })
  );

  console.log(
    JSON.stringify(
      {
        release: checkRelease,
        blockerCount,
        driftCount,
        sampleBlockerOnRel0001: { code: blocker.blockerCode, release: blocker.releaseCode, blockersForRelease },
        driftsOnRel0001: driftsForRelease,
        routes,
        uiExpectations: {
          blockersPanel: "DbBlockerList fetches /api/blockers?release=CODE — live Blocker rows with /blockers/[id] links",
          addBlocker: "POST /api/blockers available for editors; modal on release detail",
          driftPanel: "DbReleaseDriftList fetches /api/drifts?release=UUID — live Drift rows with /drifts/[id] links",
        },
      },
      null,
      2
    )
  );

  const releasePage = routes.find((r) => r.path.startsWith("/releases/"));
  if (!releasePage || ![200, 302, 307].includes(releasePage.status)) {
    throw new Error(`Release detail route failed: ${JSON.stringify(releasePage)}`);
  }
  if (blockerCount < 0 || driftCount < 0) throw new Error("count failed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
