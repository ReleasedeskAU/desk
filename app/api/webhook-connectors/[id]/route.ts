import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchWebhookConnector } from "@/lib/connectorEngineClient";
import { patchWebhookConnectorSchema } from "@/lib/validation/webhook-connector";

type Params = { params: Promise<{ id: string }> };

/** Updates active flag / name / events for a webhook connector. */
export async function PATCH(req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const parsed = patchWebhookConnectorSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);

  try {
    const row = await patchWebhookConnector(id, parsed.data);
    return NextResponse.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update webhook connector";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
