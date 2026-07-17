import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { replayWebhookEvent } from "@/lib/connectorEngineClient";

type Params = { params: Promise<{ eventId: string }> };

/** Re-queues a failed webhook event for processing. */
export async function POST(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { eventId } = await params;
  try {
    const result = await replayWebhookEvent(eventId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Replay failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}