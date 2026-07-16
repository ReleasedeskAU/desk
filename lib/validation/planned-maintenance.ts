import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();
const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a valid date")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Must be a valid date");

/**
 * POST /api/planned-maintenance body. Rejects unknown fields and never accepts a client-provided maintenanceCode.
 * Application existence is checked by the API when applicationId is supplied.
 */
export const createPlannedMaintenanceSchema = z
  .object({
    scheduledDate: dateInput,
    startTime: z.string().trim().min(1).max(20),
    endTime: z.string().trim().min(1).max(20),
    type: z.string().trim().min(1).max(120),
    environmentName: z.string().trim().min(1).max(200),
    impact: z.string().trim().min(1).max(500),
    approvalStatus: z.string().trim().min(1).max(80),
    applicationId: z.union([z.string().trim().min(1).max(64), z.null()]).optional(),
    departmentName: optionalNullableString,
    requestor: optionalNullableString,
    notes: optionalNullableString,
  })
  .strict();

export type CreatePlannedMaintenanceInput = z.infer<typeof createPlannedMaintenanceSchema>;

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
