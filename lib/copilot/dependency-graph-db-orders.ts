/**
 * Prisma-backed wrappers for blocked-release / deploy-order queries (P1-S2).
 */
import { prisma } from "@/lib/prisma";
import { buildGraph } from "@/lib/copilot/dependency-graph";
import {
  calculateDeploymentOrder,
  getBlockedReleases,
  type ReleaseLinkIndex,
} from "@/lib/copilot/dependency-graph-orders";

/**
 * Load Service→Application→Release maps plus ACTIVE blockers and release deps.
 * @param orgId - Optional org filter for Service / ServiceDependency only.
 * @returns In-memory {@link ReleaseLinkIndex}.
 * @sideEffects Multiple Prisma reads.
 */
export async function loadReleaseLinkIndex(
  orgId?: string
): Promise<ReleaseLinkIndex> {
  const serviceWhere =
    orgId === undefined ? { applicationId: { not: null } } : { organizationId: orgId, applicationId: { not: null } };

  const [services, releaseApps, blockers, deps] = await Promise.all([
    prisma.service.findMany({
      where: serviceWhere,
      select: { id: true, applicationId: true },
    }),
    prisma.releaseApplication.findMany({
      select: { applicationId: true, releaseId: true },
    }),
    prisma.deploymentBlocker.findMany({
      where: { status: "ACTIVE" },
      select: { blockingReleaseId: true, blockedReleaseId: true },
    }),
    prisma.releaseDependency.findMany({
      select: { releaseId: true, status: true },
    }),
  ]);

  const applicationByService = new Map<string, string>();
  for (const s of services) {
    if (s.applicationId) applicationByService.set(s.id, s.applicationId);
  }

  const releasesByApplication = new Map<string, string[]>();
  for (const row of releaseApps) {
    const list = releasesByApplication.get(row.applicationId) ?? [];
    list.push(row.releaseId);
    releasesByApplication.set(row.applicationId, list);
  }

  const activeBlockerReleaseIds = new Set<string>();
  for (const b of blockers) {
    activeBlockerReleaseIds.add(b.blockingReleaseId);
    activeBlockerReleaseIds.add(b.blockedReleaseId);
  }

  const dependenciesByRelease = new Map<string, { status: string | null }[]>();
  for (const d of deps) {
    const list = dependenciesByRelease.get(d.releaseId) ?? [];
    list.push({ status: d.status });
    dependenciesByRelease.set(d.releaseId, list);
  }

  return {
    applicationByService,
    releasesByApplication,
    activeBlockerReleaseIds,
    dependenciesByRelease,
  };
}

/**
 * Live getBlockedReleases against the database.
 * @param serviceId - Origin service.
 * @param orgId - Optional org filter for graph load.
 * @returns Sorted release ids.
 * @sideEffects Reads graph tables + blockers/deps.
 */
export async function getBlockedReleasesForService(
  serviceId: string,
  orgId?: string
): Promise<string[]> {
  const [graph, index] = await Promise.all([
    buildGraph(orgId),
    loadReleaseLinkIndex(orgId),
  ]);
  return getBlockedReleases(graph, serviceId, index);
}

/**
 * Live calculateDeploymentOrder against the database.
 * @param releaseIds - Releases to order services for.
 * @param orgId - Optional org filter for graph load.
 * @returns Service ids in deploy order.
 * @throws {CycleError} On cyclic induced subgraph.
 * @sideEffects Reads graph tables + release links.
 */
export async function calculateDeploymentOrderForReleases(
  releaseIds: string[],
  orgId?: string
): Promise<string[]> {
  const [graph, index] = await Promise.all([
    buildGraph(orgId),
    loadReleaseLinkIndex(orgId),
  ]);
  return calculateDeploymentOrder(graph, releaseIds, index);
}
