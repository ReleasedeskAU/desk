import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();
const dateTimeInput = z.string().trim().min(1).max(40);

/**
 * Default incident status labels (mirrors lifecycle seed).
 * Create/UI options come from the caller's incident lifecycle config; this list
 * is a fallback when config has not loaded. PATCH is validated by the lifecycle graph.
 */
export const INCIDENT_STATUSES = [
  "Active",
  "Acknowledged",
  "Investigating",
  "Escalated",
  "Resolving",
  "Resolved",
  "Closed",
  "Reopened",
] as const;

/** Sheet labels shown in create UI. */
export const INCIDENT_SEVERITY_LABELS = [
  "P1 - Critical",
  "P2 - High",
  "P3 - Medium",
  "P4 - Low",
] as const;

/** Canonical sheet labels plus legacy short codes still stored on older rows. */
export const INCIDENT_SEVERITY_VALUES = [
  ...INCIDENT_SEVERITY_LABELS,
  "P1",
  "P2",
  "P3",
  "P4",
] as const;

/**
 * POST /api/incidents body. Rejects unknown fields and never accepts a client-provided incidentCode.
 * Application and related-release existence are checked by the API.
 */
export const createIncidentSchema = z
  .object({
    timestamp: dateTimeInput,
    applicationId: z.string().trim().min(1).max(64),
    severity: z.enum(INCIDENT_SEVERITY_VALUES),
    title: z.string().trim().min(1).max(500),
    /** Validated against the caller's incident lifecycle config on create. */
    status: z.string().trim().min(1).max(80).optional(),
    impact: z.string().trim().min(1).max(200),
    environmentName: z.string().trim().min(1).max(200),
    departmentName: optionalNullableString,
    assignedTo: optionalNullableString,
    relatedReleaseCode: optionalNullableString,
  })
  .strict();

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

/**
 * PATCH /api/incidents/[id] — allowlisted fields only.
 * incidentCode is immutable (schema.strict rejects it).
 */
export const patchIncidentSchema = z
  .object({
    timestamp: z.string().trim().min(1).max(40).optional(),
    applicationId: z.string().trim().min(1).max(64).optional(),
    departmentName: optionalNullableString,
    severity: z.enum(INCIDENT_SEVERITY_VALUES).optional(),
    title: z.string().trim().min(1).max(500).optional(),
    status: z.string().trim().min(1).max(80).optional(),
    impact: z.string().trim().min(1).max(200).optional(),
    assignedTo: optionalNullableString,
    relatedReleaseCode: optionalNullableString,
    environmentName: z.string().trim().min(1).max(200).optional(),
    /** Required when Flexible soft-gates are unmet (e.g. VR-13). */
    overrideReason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export type PatchIncidentInput = z.infer<typeof patchIncidentSchema>;
