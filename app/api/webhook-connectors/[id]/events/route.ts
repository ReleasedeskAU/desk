import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { listWebhookEvents } from "@/lib/connectorEngineClient";

type Params = { params: Promise<{ id: string }> };

/** Recent delivery log for a webhook connector. */
export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  try {
    const events = await listWebhookEvents(id);
    return NextResponse.json(events);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load webhook events";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
