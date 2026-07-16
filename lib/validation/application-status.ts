import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();
const dateTimeInput = z.string().trim().min(1).max(40);

/**
 * POST /api/application-status body. Rejects unknown fields and never accepts a client-provided id.
 * One row per (applicationId, environmentName) — the API upserts current state, not history.
 */
export const createApplicationStatusSchema = z
  .object({
    applicationId: z.string().trim().min(1).max(64),
    environmentName: z.string().trim().min(1).max(200),
    status: z.string().trim().min(1).max(80),
    lastCheck: dateTimeInput,
    uptimePercent: z.coerce.number().min(0).max(100).nullable().optional(),
    notes: optionalNullableString,
  })
  .strict();

export type CreateApplicationStatusInput = z.infer<typeof createApplicationStatusSchema>;
