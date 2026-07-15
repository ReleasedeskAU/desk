import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();

/**
 * PATCH /api/monitoring-alerts/[id] — allowlisted fields only.
 * alertCode is immutable. threshold/currentValue stay strings (mixed seed formats).
 */
export const patchMonitoringAlertSchema = z
  .object({
    timestamp: z.string().trim().min(1).max(40).optional(),
    applicationId: z.string().trim().min(1).max(64).optional(),
    departmentName: optionalNullableString,
    alertType: z.string().trim().min(1).max(120).optional(),
    severity: z.string().trim().min(1).max(80).optional(),
    metric: z.string().trim().min(1).max(200).optional(),
    threshold: optionalNullableString,
    currentValue: optionalNullableString,
    status: z.string().trim().min(1).max(80).optional(),
    assignedTo: optionalNullableString,
    environmentName: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type PatchMonitoringAlertInput = z.infer<typeof patchMonitoringAlertSchema>;
