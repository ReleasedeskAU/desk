import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();
const optionalNullableDate = z.union([z.string().trim().min(1).max(40), z.null()]).optional();

export const ENVIRONMENT_VERSION_STATUSES = ["Current", "Drift", "Outdated", "Pending"] as const;

/** POST /api/environment-versions — creates one application/environment version pair. */
export const createEnvironmentVersionSchema = z
  .object({
    applicationId: z.string().trim().min(1).max(64),
    environmentId: z.string().trim().min(1).max(64),
    version: z.string().trim().min(1).max(120),
    buildNumber: z.union([z.string().trim().max(120), z.null()]).optional(),
    deployDate: z.union([z.string().date(), z.null()]).optional(),
    status: z.union([z.enum(ENVIRONMENT_VERSION_STATUSES), z.null()]).optional(),
    notes: optionalNullableString,
  })
  .strict();

export type CreateEnvironmentVersionInput = z.infer<typeof createEnvironmentVersionSchema>;

/**
 * PATCH /api/environment-versions/[id] — allowlisted fields only.
 * id is immutable; appCode is treated as display identity and rejected if sent.
 */
export const patchEnvironmentVersionSchema = z
  .object({
    version: z.string().trim().min(1).max(120).optional(),
    buildNumber: optionalNullableString,
    deployDate: optionalNullableDate,
    updatedBy: optionalNullableString,
    status: optionalNullableString,
    notes: optionalNullableString,
  })
  .strict();

export type PatchEnvironmentVersionInput = z.infer<typeof patchEnvironmentVersionSchema>;
