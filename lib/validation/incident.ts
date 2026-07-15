import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();

/**
 * PATCH /api/incidents/[id] — allowlisted fields only.
 * incidentCode is immutable (schema.strict rejects it).
 */
export const patchIncidentSchema = z
  .object({
    timestamp: z.string().trim().min(1).max(40).optional(),
    applicationId: z.string().trim().min(1).max(64).optional(),
    departmentName: optionalNullableString,
    severity: z.string().trim().min(1).max(40).optional(),
    title: z.string().trim().min(1).max(500).optional(),
    status: z.string().trim().min(1).max(80).optional(),
    impact: z.string().trim().min(1).max(200).optional(),
    assignedTo: optionalNullableString,
    relatedReleaseCode: optionalNullableString,
    environmentName: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type PatchIncidentInput = z.infer<typeof patchIncidentSchema>;
