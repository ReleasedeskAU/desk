/**
 * Shared NDJSON streaming for Ask HTTP routes.
 * PAT and OpenAI keys stay in runAskAgent — never written into the stream.
 */

import { runAskAgent, type AskHistoryTurn } from "@/lib/staffless/ask-agent";
import { ASK_PUBLIC_UNAVAILABLE } from "@/lib/staffless/ask-copy";
import { logger } from "@/lib/logger";

export const ASK_STREAM_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
};

/**
 * Stream one Ask turn as NDJSON.
 * @param message - Validated user question.
 * @param history - Prior turns, already capped by the body schema.
 * @param sessionId - Optional tab session UUID.
 */
export function askAgentNdjsonResponse(opts: {
  message: string;
  history: AskHistoryTurn[];
  sessionId?: string;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAskAgent({
          message: opts.message,
          history: opts.history,
          sessionId: opts.sessionId,
        })) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (err) {
        logger.error("ask.http_stream", { kind: err instanceof Error ? err.name : "unknown" });
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type: "error", message: ASK_PUBLIC_UNAVAILABLE })}\n`)
        );
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "done" })}\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: ASK_STREAM_HEADERS });
}
