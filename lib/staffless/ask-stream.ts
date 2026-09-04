/**
 * Server-side NDJSON transform: StaffLess packets → Ask events for the browser.
 */

import { ASK_PUBLIC_UNAVAILABLE } from "@/lib/staffless/ask-copy";
import {
  mapStafflessLineToAskEvents,
  type AskEvent,
} from "@/lib/staffless/ask-packets";

function encodeEvent(event: AskEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

/**
 * Read a StaffLess NDJSON body and emit simplified Ask events.
 * Always starts with a session event so the client can keep conversation context.
 * @param body - Upstream readable body (not buffered as JSON).
 * @param sessionId - StaffLess chat_session_id for this turn.
 * @returns NDJSON stream of AskEvent objects.
 */
export function pipeStafflessAskStream(
  body: ReadableStream<Uint8Array>,
  sessionId: string
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encodeEvent({ type: "session", sessionId }));
      try {
        await forEachNdjsonLine(body, (line) => {
          for (const event of mapStafflessLineToAskEvents(line)) {
            controller.enqueue(encodeEvent(event));
          }
        });
      } catch {
        controller.enqueue(encodeEvent({ type: "error", message: ASK_PUBLIC_UNAVAILABLE }));
      } finally {
        controller.enqueue(encodeEvent({ type: "done" }));
        controller.close();
      }
    },
  });
}

/**
 * Split a byte stream on newlines and invoke `onLine` for each complete line.
 */
export async function forEachNdjsonLine(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    }
    if (buffer.trim()) onLine(buffer);
  } finally {
    reader.releaseLock();
  }
}
