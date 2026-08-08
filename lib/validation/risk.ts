import { z } from "zod";

/**
 * Likelihood / impact dimensions for Simple Risk Score (System 1).
 * Default 1–5 matches shipped defaults; use {@link riskScoreDimSchema} when
 * the caller's UserRiskEngineConfig raises the max.
 */
export const RISK_SCORE_DIM = z.coerce.number().int().min(1).max(5);

/**
 * Build a likelihood/impact zod dim constrained to 1..max (inclusive).
 * @param max - Upper bound from UserRiskEngineConfig (clamped 2–10).
 */
export function riskScoreDimSchema(max: number) {
  const upper = Math.min(10, Math.max(2, Math.round(max)));
  return z.coerce.number().int().min(1).max(upper);
}

/**
 * Canonical risk statuses for create / UI.
 * PATCH is validated by the risk lifecycle graph; legacy Open / Monitoring /
 * In Progress still resolve via aliases at enforce time.
 */
export const RISK_STATUSES = [
  "Identified",
  "Assessing",
  "Mitigating",
  "Mitigated",
  "Accepted",
  "Closed",
  "Escalated",
] as const;

/**
 * POST /api/risks body factory — scale comes from the caller's risk engine config.
 * @param likelihoodMax - Max likelihood from config.
 * @param impactMax - Max impact from config.
 */
export function createRiskSchemaForScale(likelihoodMax: number, impactMax: number) {
  const likelihood = riskScoreDimSchema(likelihoodMax);
  const impact = riskScoreDimSchema(impactMax);
  return z
    .object({
      releaseId: z.string().trim().min(1).max(64),
      applicationId: z.string().trim().min(1).max(64),
      category: z.string().trim().min(1).max(120),
      description: z.string().trim().min(1).max(4000),
      likelihood,
      impact,
      affectedArea: z.string().trim().max(500).nullable().optional(),
      mitigationStrategy: z.string().trim().max(4000).nullable().optional(),
      riskOwnerId: z.string().trim().max(64).nullable().optional(),
      status: z.enum(RISK_STATUSES).optional(),
      notes: z.string().trim().max(4000).nullable().optional(),
    })
    .strict();
}

/** Default create schema (1–5) for callers that have not loaded config yet. */
export const createRiskSchema = createRiskSchemaForScale(5, 5);

export type CreateRiskInput = z.infer<typeof createRiskSchema>;

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();

/**
 * PATCH /api/risks/[id] factory — scale from UserRiskEngineConfig.
 * @param likelihoodMax - Max likelihood from config.
 * @param impactMax - Max impact from config.
 */
export function patchRiskSchemaForScale(likelihoodMax: number, impactMax: number) {
  const likelihood = riskScoreDimSchema(likelihoodMax).optional();
  const impact = riskScoreDimSchema(impactMax).optional();
  return z
    .object({
      releaseId: z.string().trim().min(1).max(64).optional(),
      applicationId: z.string().trim().min(1).max(64).optional(),
      applicationName: optionalNullableString,
      departmentName: optionalNullableString,
      category: z.string().trim().min(1).max(120).optional(),
      description: z.string().trim().min(1).max(4000).optional(),
      likelihood,
      impact,
      affectedArea: optionalNullableString,
      mitigationStrategy: optionalNullableString,
      riskOwnerId: z.union([z.string().trim().min(1).max(64), z.null()]).optional(),
      status: z.string().trim().min(1).max(64).optional(),
      notes: optionalNullableString,
      /** Required when Flexible soft-gates are unmet. */
      overrideReason: z.string().trim().min(1).max(2000).optional(),
    })
    .strict();
}

/** Default patch schema (1–5). */
export const patchRiskSchema = patchRiskSchemaForScale(5, 5);

export type PatchRiskInput = z.infer<typeof patchRiskSchema>;
