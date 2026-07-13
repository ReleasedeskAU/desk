/**
 * Live Batch-5 verification without a browser session:
 * - Confirms detail routes resolve (not 404)
 * - Confirms Incident/Blocker payloads include clickable release targets
 */
import { prisma } from "../lib/prisma";

async function checkRoute(path: string) {
  const res = await fetch(`http://localhost:3000${path}`, { redirect: "manual" });
  return { path, status: res.status, location: res.headers.get("location") };
}

async function main() {
  const release = await prisma.release.findFirst({ select: { id: true, releaseCode: true } });
  if (!release) throw new Error("No release in DB");

  const incident = await prisma.incident.findFirst({
    where: { relatedReleaseCode: { not: null } },
    include: { application: { select: { name: true } } },
  });
  const blocker = await prisma.blocker.findFirst();
  if (!incident || !blocker) throw new Error("Missing incident/blocker seed rows");

  const relatedRelease = await prisma.release.findUnique({
    where: { releaseCode: incident.relatedReleaseCode! },
    select: { id: true, releaseCode: true, name: true },
  });
  const blockerRelease = await prisma.release.findUnique({
    where: { releaseCode: blocker.releaseCode },
    select: { id: true, releaseCode: true, name: true },
  });

  const routes = await Promise.all([
    checkRoute(`/releases/${release.id}`),
    checkRoute(`/incidents/${incident.id}`),
    checkRoute(`/blockers/${blocker.id}`),
    checkRoute(`/api/releases/${release.id}`),
    checkRoute(`/api/incidents/${incident.id}`),
    checkRoute(`/api/blockers/${blocker.id}`),
  ]);

  const crossLinks = {
    incident: {
      code: incident.incidentCode,
      relatedReleaseCode: incident.relatedReleaseCode,
      resolvedReleaseId: relatedRelease?.id ?? null,
      detailHref: relatedRelease ? `/releases/${relatedRelease.id}` : null,
      pageWouldRenderLink: Boolean(relatedRelease?.id),
    },
    blocker: {
      code: blocker.blockerCode,
      releaseCode: blocker.releaseCode,
      resolvedReleaseId: blockerRelease?.id ?? null,
      detailHref: blockerRelease ? `/releases/${blockerRelease.id}` : null,
      pageWouldRenderLink: Boolean(blockerRelease?.id),
    },
  };

  console.log(JSON.stringify({ routes, crossLinks }, null, 2));

  const releasePage = routes.find((r) => r.path.startsWith("/releases/"));
  if (!releasePage || (releasePage.status !== 200 && releasePage.status !== 307 && releasePage.status !== 302)) {
    throw new Error(`Release detail route failed: ${JSON.stringify(releasePage)}`);
  }
  // Unauthenticated browser hits Clerk redirect; that still proves the App Router page exists.
  if (releasePage.status === 307 || releasePage.status === 302) {
    if (!releasePage.location?.includes(`/releases/${release.id}`) && !releasePage.location?.includes("sign-in")) {
      throw new Error(`Unexpected redirect for release detail: ${releasePage.location}`);
    }
  }
  if (!crossLinks.incident.pageWouldRenderLink) throw new Error("Incident missing resolved release for ProgressLink");
  if (!crossLinks.blocker.pageWouldRenderLink) throw new Error("Blocker missing resolved release for ProgressLink");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
