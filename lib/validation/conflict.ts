import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(2000), z.null()]).optional();

/**
 * Canonical conflict statuses for create / UI.
 * PATCH is validated by the conflict lifecycle graph; legacy Open / In Progress /
 * Escalated still resolve via aliases at enforce time.
 */
export const CONFLICT_STATUSES = [
  "Detected",
  "Under Review",
  "Resolved",
  "Dismissed",
] as const;

export const CONFLICT_TYPES = ["Schedule", "Resource", "Application"] as const;

/**
 * Lifecycle defaults plus any extra labels (seed types on the Release page).
 * Empty / whitespace extras are dropped; order keeps defaults first.
 */
export function mergeConflictTypes(extra: string[] = []): string[] {
  return [...new Set([...CONFLICT_TYPES, ...extra.map((item) => item.trim()).filter(Boolean)])];
}

/**
 * POST /api/conflicts body. Rejects unknown fields and never accepts a client-provided Conflict ID.
 * Release code existence is validated by the API.
 */
export const createConflictSchema = z
  .object({
    /** Validated against enabled conflict lifecycle labels in the route. */
    status: z.string().trim().max(80).optional(),
    priority: z.string().trim().min(1).max(80),
    release1Code: z.string().trim().min(1).max(64),
    release2Code: z.string().trim().min(1).max(64),
    application: z.string().trim().min(1).max(200),
    department: z.string().trim().min(1).max(120),
    conflictingEnvironment: z.string().trim().min(1).max(200),
    environmentConflictType: z.string().trim().min(1).max(120),
    assignedTo: optionalNullableString,
    notes: optionalNullableString,
  })
  .strict();

export type CreateConflictInput = z.infer<typeof createConflictSchema>;

/**
 * PATCH /api/conflicts/[id] — allowlisted fields only.
 * conflictCode (Conflict ID) is immutable and must not appear in the body.
 */
export const patchConflictSchema = z
  .object({
    status: z.string().trim().min(1).max(80).optional(),
    priority: z.string().trim().min(1).max(80).optional(),
    release1Code: z.string().trim().min(1).max(64).optional(),
    release2Code: z.string().trim().min(1).max(64).optional(),
    application: z.string().trim().min(1).max(200).optional(),
    department: z.string().trim().min(1).max(120).optional(),
    conflictingEnvironment: z.string().trim().min(1).max(200).optional(),
    environmentConflictType: z.string().trim().min(1).max(120).optional(),
    assignedTo: optionalNullableString,
    notes: optionalNullableString,
    /** Required when Flexible soft-gates are unmet (e.g. Dismiss without notes). */
    overrideReason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export type PatchConflictInput = z.infer<typeof patchConflictSchema>;
