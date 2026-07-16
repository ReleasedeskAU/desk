import { z } from "zod";

/** Likelihood / impact dimensions for Simple Risk Score (System 1): each 1–5 → score 1–25. */
export const RISK_SCORE_DIM = z.coerce.number().int().min(1).max(5);

/** Allowed lifecycle states for a qualitative risk. */
export const RISK_STATUSES = [
  "Open",
  "Monitoring",
  "Mitigating",
  "In Progress",
  "Escalated",
  "Accepted",
  "Closed",
] as const;

/**
 * POST /api/risks body. Rejects unexpected fields; riskScore is never accepted from client.
 * The API derives riskCode and denormalized department/application names.
 */
export const createRiskSchema = z
  .object({
    releaseId: z.string().trim().min(1).max(64),
    applicationId: z.string().trim().min(1).max(64),
    category: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(4000),
    likelihood: RISK_SCORE_DIM,
    impact: RISK_SCORE_DIM,
    affectedArea: z.string().trim().max(500).nullable().optional(),
    mitigationStrategy: z.string().trim().max(4000).nullable().optional(),
    riskOwnerId: z.string().trim().max(64).nullable().optional(),
    status: z.enum(RISK_STATUSES).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

export type CreateRiskInput = z.infer<typeof createRiskSchema>;

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();

/**
 * PATCH /api/risks/[id] — allowlisted fields only.
 * riskCode is immutable; riskScore is server-derived from likelihood × impact.
 */
export const patchRiskSchema = z
  .object({
    releaseId: z.string().trim().min(1).max(64).optional(),
    applicationName: optionalNullableString,
    departmentName: optionalNullableString,
    category: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(4000).optional(),
    likelihood: RISK_SCORE_DIM.optional(),
    impact: RISK_SCORE_DIM.optional(),
    affectedArea: optionalNullableString,
    mitigationStrategy: optionalNullableString,
    riskOwnerId: z.union([z.string().trim().min(1).max(64), z.null()]).optional(),
    status: z.string().trim().min(1).max(64).optional(),
    notes: optionalNullableString,
  })
  .strict();

export type PatchRiskInput = z.infer<typeof patchRiskSchema>;
