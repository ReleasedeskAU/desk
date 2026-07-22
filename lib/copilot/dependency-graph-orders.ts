/**
 * Pure release-link index + deploy-order / blocked-release helpers for P1-S2.
 * Kept free of Prisma so fixtures can drive exact expected values.
 */
import { CycleError } from "@/lib/copilot/errors";
import {
  DependencyGraph,
  type ServiceEdge,
} from "@/lib/copilot/dependency-graph";
import { isReleaseDependencyUnmet } from "@/lib/copilot/release-services";

/** In-memory join data for Service → Application → Release lookups. */
export type ReleaseLinkIndex = {
  /** serviceId → applicationId (only linked services). */
  applicationByService: Map<string, string>;
  /** applicationId → release ids. */
  releasesByApplication: Map<string, string[]>;
  /**
   * Release ids that appear on an ACTIVE DeploymentBlocker
   * (either blockingReleaseId or blockedReleaseId).
   */
  activeBlockerReleaseIds: Set<string>;
  /** Outbound ReleaseDependency rows keyed by dependent releaseId. */
  dependenciesByRelease: Map<string, { status: string | null }[]>;
};

/**
 * Resolve release ids for services that have an applicationId bridge.
 * @param serviceIds - Candidate services (e.g. blast radius).
 * @param index - Join maps.
 * @returns Unique release ids.
 */
export function releasesForServices(
  serviceIds: Iterable<string>,
  index: ReleaseLinkIndex
): string[] {
  const out = new Set<string>();
  for (const serviceId of serviceIds) {
    const applicationId = index.applicationByService.get(serviceId);
    if (!applicationId) continue;
    const releases = index.releasesByApplication.get(applicationId);
    if (!releases) continue;
    for (const releaseId of releases) out.add(releaseId);
  }
  return [...out];
}

/**
 * Whether a release currently has an ACTIVE DeploymentBlocker involvement
 * or at least one unmet outbound ReleaseDependency.
 * @param releaseId - Release to check.
 * @param index - Blocker / dependency index.
 */
export function releaseIsBlockedOrUnmet(
  releaseId: string,
  index: ReleaseLinkIndex
): boolean {
  if (index.activeBlockerReleaseIds.has(releaseId)) return true;
  const deps = index.dependenciesByRelease.get(releaseId) ?? [];
  return deps.some((d) => isReleaseDependencyUnmet(d.status));
}

/**
 * Releases whose services fall in `serviceId`'s blast radius and that have an
 * ACTIVE DeploymentBlocker or an unmet ReleaseDependency.
 *
 * @param graph - Assembled dependency graph.
 * @param serviceId - Origin service for blast radius.
 * @param index - Service→Release join + blocker/dep facts.
 * @returns Sorted unique release ids.
 */
export function getBlockedReleases(
  graph: DependencyGraph,
  serviceId: string,
  index: ReleaseLinkIndex
): string[] {
  const { services } = graph.getBlastRadius(serviceId);
  const candidateReleases = releasesForServices(services, index);
  return candidateReleases
    .filter((releaseId) => releaseIsBlockedOrUnmet(releaseId, index))
    .sort();
}

/**
 * Service ids belonging to any of the given releases (via the same bridge).
 * @param releaseIds - Releases to expand.
 * @param index - Join maps.
 */
export function servicesForReleases(
  releaseIds: Iterable<string>,
  index: ReleaseLinkIndex
): string[] {
  const wanted = new Set(releaseIds);
  const applicationIds = new Set<string>();
  for (const [applicationId, releases] of index.releasesByApplication) {
    if (releases.some((r) => wanted.has(r))) applicationIds.add(applicationId);
  }
  const services: string[] = [];
  for (const [serviceId, applicationId] of index.applicationByService) {
    if (applicationIds.has(applicationId)) services.push(serviceId);
  }
  return services;
}

/**
 * Topological deployment order (Kahn) for services belonging to `releaseIds`.
 * Edge source→target means source depends on target ⇒ target must deploy first.
 *
 * @param graph - Full dependency graph (subgraph is induced).
 * @param releaseIds - Releases whose linked services participate.
 * @param index - Service↔Release bridge.
 * @returns Service ids in deploy-first order.
 * @throws {CycleError} When the induced subgraph has a directed cycle.
 */
export function calculateDeploymentOrder(
  graph: DependencyGraph,
  releaseIds: string[],
  index: ReleaseLinkIndex
): string[] {
  const selected = new Set(servicesForReleases(releaseIds, index));
  if (selected.size === 0) return [];

  // Induce subgraph edges; build precedence target→source (deploy target before source).
  const predecessors = new Map<string, Set<string>>();
  const successors = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();
  for (const id of selected) {
    predecessors.set(id, new Set());
    successors.set(id, new Set());
    inDegree.set(id, 0);
  }

  for (const source of selected) {
    for (const target of graph.neighbors(source)) {
      if (!selected.has(target)) continue;
      // source depends on target ⇒ target precedes source
      if (successors.get(target)!.has(source)) continue;
      successors.get(target)!.add(source);
      predecessors.get(source)!.add(target);
      inDegree.set(source, (inDegree.get(source) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  queue.sort();

  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    const nexts = [...(successors.get(node) ?? [])].sort();
    for (const next of nexts) {
      const nextDeg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDeg);
      if (nextDeg === 0) {
        queue.push(next);
        queue.sort();
      }
    }
  }

  if (order.length !== selected.size) {
    const subEdges: ServiceEdge[] = [];
    for (const source of selected) {
      for (const target of graph.neighbors(source)) {
        if (selected.has(target)) {
          subEdges.push({ sourceServiceId: source, targetServiceId: target });
        }
      }
    }
    const sub = DependencyGraph.fromData(selected, subEdges);
    const cycles = sub.detectCycles();
    throw new CycleError(cycles[0] ?? [...selected, [...selected][0]!]);
  }

  return order;
}
