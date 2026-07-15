import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();
const optionalNullableDate = z.union([z.string().trim().min(1).max(40), z.null()]).optional();

/**
 * PATCH /api/drifts/[id] — allowlisted fields only.
 * driftCode (Drift ID) is immutable and must not appear in the body.
 */
export const patchDriftSchema = z
  .object({
    releaseId: z.string().trim().min(1).max(64).optional(),
    applicationId: z.string().trim().min(1).max(64).optional(),
    departmentName: optionalNullableString,
    environmentName: z.string().trim().min(1).max(200).optional(),
    driftType: z.string().trim().min(1).max(120).optional(),
    driftCategory: optionalNullableString,
    detectedDate: z.string().trim().min(1).max(40).optional(),
    severity: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().min(1).max(4000).optional(),
    impactOnRelease: optionalNullableString,
    remediationAction: optionalNullableString,
    status: z.string().trim().min(1).max(80).optional(),
    etaToFix: optionalNullableDate,
  })
  .strict();

export type PatchDriftInput = z.infer<typeof patchDriftSchema>;
