import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();

/** ISO-8601 or other parseable datetime string for alert timestamp. */
const isoTimestamp = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Must be a valid ISO timestamp");

/**
 * POST /api/monitoring-alerts body. Rejects unknown fields and never accepts a client-provided alertCode.
 * Application existence is validated by the API.
 */
export const createMonitoringAlertSchema = z
  .object({
    timestamp: isoTimestamp,
    applicationId: z.string().trim().min(1).max(64),
    alertType: z.string().trim().min(1).max(120),
    severity: z.string().trim().min(1).max(80),
    metric: z.string().trim().min(1).max(200),
    environmentName: z.string().trim().min(1).max(200),
    status: z.string().trim().min(1).max(80),
    departmentName: optionalNullableString,
    threshold: optionalNullableString,
    currentValue: optionalNullableString,
    assignedTo: optionalNullableString,
  })
  .strict();

export type CreateMonitoringAlertInput = z.infer<typeof createMonitoringAlertSchema>;

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
