/**
 * Default DB loader for {@link buildGraph}. Kept separate so the graph engine
 * module stays free of Prisma / app imports for unit tests and reuse.
 */
import { prisma } from "@/lib/prisma";
import type { DependencyGraphLoader } from "./dependency-graph";

/** Loads Service / ServiceDependency rows; orgId filters when provided. */
export const defaultDependencyGraphLoader: DependencyGraphLoader = {
  async loadServices(orgId) {
    return prisma.service.findMany({
      where: orgId === undefined ? undefined : { organizationId: orgId },
      select: { id: true },
    });
  },
  async loadEdges(orgId) {
    return prisma.serviceDependency.findMany({
      where: orgId === undefined ? undefined : { organizationId: orgId },
      select: { sourceServiceId: true, targetServiceId: true },
    });
  },
};
