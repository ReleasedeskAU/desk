import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { zodErrorResponse } from "@/lib/api-errors";
import {
  createWebhookConnector,
  listWebhookConnectors,
} from "@/lib/connectorEngineClient";
import { createWebhookConnectorSchema } from "@/lib/validation/webhook-connector";

/** Lists webhook connectors (no secrets). */
export async function GET() {
  const { error } = await requireRole("readonly");
  if (error) return error;

  try {
    const rows = await listWebhookConnectors();
    return NextResponse.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list webhook connectors";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * Creates a webhook connector via connector-engine.
 * Returns plaintext secret once for UI display — never log it.
 */
export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = createWebhookConnectorSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);

  try {
    const created = await createWebhookConnector(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create webhook connector";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
