import { z } from "zod";

export const WEBHOOK_PROVIDERS = ["jira", "github"] as const;
export const JIRA_WEBHOOK_EVENTS = [
  "jira:issue_created",
  "jira:issue_updated",
  "jira:issue_deleted",
] as const;

/**
 * POST /api/webhook-connectors — allowlisted fields only.
 * endpointToken/secret are never accepted from the client.
 */
export const createWebhookConnectorSchema = z
  .object({
    provider: z.enum(WEBHOOK_PROVIDERS),
    name: z.string().trim().min(1).max(200),
    baseUrl: z.string().trim().url().max(500).nullable().optional(),
    events: z.array(z.string().trim().min(1).max(120)).min(1).max(40),
    active: z.boolean().optional(),
  })
  .strict();

export const patchWebhookConnectorSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    active: z.boolean().optional(),
    events: z.array(z.string().trim().min(1).max(120)).min(1).max(40).optional(),
    baseUrl: z.string().trim().url().max(500).nullable().optional(),
  })
  .strict();
