import { z } from "zod";

/** Likelihood / impact dimensions for Simple Risk Score (System 1): each 1–5 → score 1–25. */
export const RISK_SCORE_DIM = z.coerce.number().int().min(1).max(5);

/**
 * POST /api/risks body. Rejects unexpected fields; riskScore is never accepted from client.
 */
export const createRiskSchema = z
  .object({
    riskCode: z.string().trim().min(1).max(64),
    releaseId: z.string().trim().min(1).max(64),
    category: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(4000),
    likelihood: RISK_SCORE_DIM,
    impact: RISK_SCORE_DIM,
    affectedArea: z.string().trim().max(500).nullable().optional(),
    mitigationStrategy: z.string().trim().max(4000).nullable().optional(),
    riskOwnerId: z.string().trim().max(64).nullable().optional(),
    status: z.string().trim().max(64).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

export type CreateRiskInput = z.infer<typeof createRiskSchema>;
