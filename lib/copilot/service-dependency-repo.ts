import { prisma } from "@/lib/prisma";
import { ServiceDependencySelfReferenceError } from "@/lib/copilot/errors";

export type CreateServiceDependencyInput = {
  organizationId?: string | null;
  sourceServiceId: string;
  targetServiceId: string;
  versionConstraint?: string | null;
  criticality: string;
};

/**
 * Create a directed ServiceDependency edge.
 * Rejects self-dependencies before any database write.
 * organizationId is optional and unenforced (no org filtering).
 *
 * @param input - Edge fields. source and target must differ.
 * @returns The created ServiceDependency row.
 * @throws {ServiceDependencySelfReferenceError} When sourceServiceId === targetServiceId.
 * @sideEffects Inserts one ServiceDependency via Prisma create when valid.
 */
export async function createServiceDependency(input: CreateServiceDependencyInput) {
  if (input.sourceServiceId === input.targetServiceId) {
    throw new ServiceDependencySelfReferenceError(input.sourceServiceId);
  }

  return prisma.serviceDependency.create({
    data: {
      organizationId: input.organizationId ?? null,
      sourceServiceId: input.sourceServiceId,
      targetServiceId: input.targetServiceId,
      versionConstraint: input.versionConstraint ?? null,
      criticality: input.criticality,
    },
  });
}
