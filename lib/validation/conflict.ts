import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(2000), z.null()]).optional();

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
  })
  .strict();

export type PatchConflictInput = z.infer<typeof patchConflictSchema>;
