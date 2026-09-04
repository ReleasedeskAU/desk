import { requireRole } from "@/lib/auth/api";
import { zodErrorResponse } from "@/lib/api-errors";
import { runAskAgent } from "@/lib/staffless/ask-agent";
import { ASK_PUBLIC_UNAVAILABLE } from "@/lib/staffless/ask-copy";
import { askBodySchema } from "@/lib/staffless/ask-schema";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

const STREAM_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
};

/**
 * Stream an Ask turn. Tool-calling agent on the server (PAT and OpenAI key never
 * go to the browser). Catalog tools cover count, breakdown, distinct values, and key lookup.
 */
export async function POST(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = askBodySchema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAskAgent({
          message: parsed.data.message,
          history: parsed.data.history ?? [],
          sessionId: parsed.data.sessionId,
        })) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (err) {
        logger.error("api/ask.POST", { kind: err instanceof Error ? err.name : "unknown" });
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type: "error", message: ASK_PUBLIC_UNAVAILABLE })}\n`)
        );
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "done" })}\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: STREAM_HEADERS });
}