import { z } from "zod";

const historyTurnSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(8000),
  })
  .strict();

/**
 * Browser → Release Desk Ask API. Extra fields are rejected.
 * sessionId is this tab's conversation id. history is prior turns in the tab.
 */
export const askBodySchema = z
  .object({
    message: z.string().trim().min(1).max(8000),
    sessionId: z.string().uuid().optional(),
    history: z.array(historyTurnSchema).max(16).optional(),
  })
  .strict();

export type AskBody = z.infer<typeof askBodySchema>;
