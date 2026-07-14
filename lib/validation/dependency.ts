import { z } from "zod";

export const DEPENDENCY_TYPES = ["Hard", "Soft", "Technical", "Data", "Integration"] as const;
export const DEPENDENCY_STATUSES = ["Blocked", "At Risk", "Clear", "Resolved"] as const;
export const DEPENDENCY_IMPACTS = [
  "Release Delay",
  "Partial Functionality",
  "Data Integrity Risk",
  "Integration Failure",
  "Scope Reduction",
] as const;

/**
 * POST /api/dependencies body — allowlisted fields only.
 * dependencyCode is server-assigned; never accept from client.
 */
export const createDependencySchema = z
  .object({
    releaseId: z.string().trim().min(1).max(64),
    dependsOnReleaseId: z.string().trim().min(1).max(64),
    dependencyType: z.enum(DEPENDENCY_TYPES),
    status: z.enum(DEPENDENCY_STATUSES).default("Clear"),
    impactIfBlocked: z.enum(DEPENDENCY_IMPACTS),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict()
  .refine((v) => v.releaseId !== v.dependsOnReleaseId, {
    message: "A release cannot depend on itself",
    path: ["dependsOnReleaseId"],
  });

/**
 * PATCH /api/dependencies/[id] — partial allowlist; rejects unknown fields.
 */
export const patchDependencySchema = z
  .object({
    releaseId: z.string().trim().min(1).max(64).optional(),
    dependsOnReleaseId: z.string().trim().min(1).max(64).optional(),
    dependencyType: z.enum(DEPENDENCY_TYPES).optional(),
    status: z.enum(DEPENDENCY_STATUSES).optional(),
    impactIfBlocked: z.enum(DEPENDENCY_IMPACTS).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.releaseId === undefined ||
      v.dependsOnReleaseId === undefined ||
      v.releaseId !== v.dependsOnReleaseId,
    {
      message: "A release cannot depend on itself",
      path: ["dependsOnReleaseId"],
    }
  );

export type CreateDependencyInput = z.infer<typeof createDependencySchema>;
export type PatchDependencyInput = z.infer<typeof patchDependencySchema>;
