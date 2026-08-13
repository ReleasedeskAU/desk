import { z } from "zod";
import { BLOCKER_CATEGORIES } from "@/lib/blocker-categories";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();
const optionalNullableDate = z.union([z.string().trim().min(1).max(40), z.null()]).optional();
const optionalNullableInt = z.union([z.number().int().min(0).max(3650), z.null()]).optional();

const blockerCategorySchema = z.enum(BLOCKER_CATEGORIES);

/**
 * PATCH /api/blockers/[id] — allowlisted fields only.
 * blockerCode (Blocker ID) is immutable and must not appear in the body.
 */
export const patchBlockerSchema = z
  .object({
    releaseCode: z.string().trim().min(1).max(64).optional(),
    releaseName: z.string().trim().min(1).max(200).optional(),
    department: z.string().trim().min(1).max(120).optional(),
    application: z.string().trim().min(1).max(200).optional(),
    blockerType: blockerCategorySchema.optional(),
    blockerDescription: z.string().trim().min(1).max(4000).optional(),
    severity: z.string().trim().min(1).max(80).optional(),
    raisedBy: z.string().trim().min(1).max(200).optional(),
    status: z.string().trim().min(1).max(80).optional(),
    escalationLevel: z.string().trim().min(1).max(80).optional(),
    impactOnRelease: z.string().trim().min(1).max(2000).optional(),
    assignedTo: optionalNullableString,
    rootCause: optionalNullableString,
    resolutionNotes: optionalNullableString,
    raisedDate: optionalNullableDate,
    targetResolutionDate: optionalNullableDate,
    actualResolutionDate: optionalNullableDate,
    daysOpen: optionalNullableInt,
    /** Required when a Flexible lifecycle edge needs an override (min length enforced in transition). */
    overrideReason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export type PatchBlockerInput = z.infer<typeof patchBlockerSchema>;
