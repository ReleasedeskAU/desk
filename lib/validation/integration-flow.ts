import { z } from "zod";

/**
 * PATCH /api/integration-flows/[id] — allowlisted fields only.
 * flowCode is immutable (schema.strict rejects it).
 */
export const patchIntegrationFlowSchema = z
  .object({
    sourceSystem: z.string().trim().min(1).max(200).optional(),
    targetSystem: z.string().trim().min(1).max(200).optional(),
    integrationType: z.string().trim().min(1).max(120).optional(),
    frequency: z.string().trim().min(1).max(120).optional(),
    dataElements: z.string().trim().min(1).max(4000).optional(),
    businessPurpose: z.string().trim().min(1).max(4000).optional(),
  })
  .strict();

export type PatchIntegrationFlowInput = z.infer<typeof patchIntegrationFlowSchema>;
