import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();
const optionalNullableDate = z.union([z.string().trim().min(1).max(40), z.null()]).optional();
const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a valid date")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Must be a valid date");

/** Allowed impact levels for a configuration drift. */
export const DRIFT_SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;

/** Allowed lifecycle states for a configuration drift. */
export const DRIFT_STATUSES = [
  "Detected",
  "Investigating",
  "Approved",
  "Reverted",
  "Escalated",
] as const;

/**
 * POST /api/drifts body. Rejects unknown fields and never accepts a client-provided Drift ID.
 * Drift type membership and release/application/environment relationships are checked by the API.
 */
export const createDriftSchema = z
  .object({
    releaseId: z.string().trim().min(1).max(64),
    applicationId: z.string().trim().min(1).max(64),
    environmentName: z.string().trim().min(1).max(200),
    driftType: z.string().trim().min(1).max(120),
    driftCategory: optionalNullableString,
    detectedDate: dateInput,
    severity: z.enum(DRIFT_SEVERITIES),
    description: z.string().trim().min(1).max(4000),
    impactOnRelease: optionalNullableString,
    remediationAction: optionalNullableString,
    /** Validated against the caller's drift lifecycle config on create. */
    status: z.string().trim().min(1).max(80).optional(),
    etaToFix: z.union([dateInput, z.null()]).optional(),
  })
  .strict();

export type CreateDriftInput = z.infer<typeof createDriftSchema>;

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
    /** Soft-gate override when a Flexible transition needs justification. */
    overrideReason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export type PatchDriftInput = z.infer<typeof patchDriftSchema>;
