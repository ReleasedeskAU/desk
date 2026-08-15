import { z } from "zod";

export const DEPENDENCY_TYPES = ["Hard", "Soft", "Technical", "Data", "Integration"] as const;
/** What kind of thing is depended on — distinct from Type (severity / VR-18). */
export const DEPENDENCY_KINDS = [
  "Release-to-Release",
  "System",
  "Data",
  "Resource",
  "Environment",
  "External",
  "Regulatory",
] as const;
/**
 * Canonical dependency statuses for create / UI.
 * PATCH is validated by the dependency lifecycle graph; legacy Clear / Resolved /
 * Blocked still resolve via aliases at enforce time.
 */
export const DEPENDENCY_STATUSES = [
  "Identified",
  "Pending",
  "In Progress",
  "At Risk",
  "Blocked",
  "Escalated",
  "Met",
  "Waived",
  "Removed",
] as const;
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
    dependencyKind: z.enum(DEPENDENCY_KINDS).optional(),
    /** Validated against enabled dependency lifecycle labels in the route. */
    status: z.string().trim().max(80).optional(),
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
    dependencyKind: z.enum(DEPENDENCY_KINDS).optional(),
    status: z.string().trim().min(1).max(80).optional(),
    impactIfBlocked: z.enum(DEPENDENCY_IMPACTS).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    /** Required when Flexible soft-gates are unmet (e.g. Waive without notes). */
    overrideReason: z.string().trim().min(1).max(2000).optional(),
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
