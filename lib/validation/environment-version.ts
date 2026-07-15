import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();
const optionalNullableDate = z.union([z.string().trim().min(1).max(40), z.null()]).optional();

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
