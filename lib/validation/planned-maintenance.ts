import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();

/**
 * PATCH /api/planned-maintenance/[id] — allowlisted fields only.
 * maintenanceCode is immutable (schema.strict rejects it).
 */
export const patchPlannedMaintenanceSchema = z
  .object({
    scheduledDate: z.string().trim().min(1).max(40).optional(),
    startTime: z.string().trim().min(1).max(20).optional(),
    endTime: z.string().trim().min(1).max(20).optional(),
    type: z.string().trim().min(1).max(120).optional(),
    applicationId: z.union([z.string().trim().min(1).max(64), z.null()]).optional(),
    environmentName: z.string().trim().min(1).max(200).optional(),
    departmentName: optionalNullableString,
    impact: z.string().trim().min(1).max(500).optional(),
    requestor: optionalNullableString,
    approvalStatus: z.string().trim().min(1).max(80).optional(),
    notes: optionalNullableString,
  })
  .strict();

export type PatchPlannedMaintenanceInput = z.infer<typeof patchPlannedMaintenanceSchema>;
