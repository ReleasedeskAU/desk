/**
 * Ask test-route client. Token is never written to results or logs.
 */

import { ASK_STREAM_TIMEOUT_MS, jsonPost, publicHttpError } from "./http";
import { parseAskNdjson } from "./ndjson";
import type { AskParsed, HttpCallRecord } from "./types";

export type AskHistoryTurn = { role: "user" | "assistant"; content: string };

export type AskCallResult = {
  status: number | null;
  ok: boolean;
  parsed: AskParsed;
  error?: string;
  calls: HttpCallRecord[];
  duration_ms: number;
};

/**
 * POST one Ask turn and parse NDJSON. history must exclude the current message.
 */
export async function callAskTest(opts: {
  url: string;
  token: string;
  message: string;
  sessionId?: string;
  history?: AskHistoryTurn[];
}): Promise<AskCallResult> {
  const body: Record<string, unknown> = { message: opts.message };
  if (opts.sessionId) body.sessionId = opts.sessionId;
  if (opts.history && opts.history.length > 0) body.history = opts.history;

  const result = await jsonPost({
    url: opts.url,
    token: opts.token,
    body,
    timeoutMs: ASK_STREAM_TIMEOUT_MS,
    target: "ask",
    endpoint: "/api/ask/test",
  });

  const parsed = result.text ? parseAskNdjson(result.text) : parseAskNdjson("");
  if (!result.ok && result.json && typeof result.json === "object") {
    const err = (result.json as { error?: unknown }).error;
    if (typeof err === "string" && !parsed.error_event) {
      parsed.error_event = { type: "error", message: err };
    }
  }

  const errors: string[] = [];
  if (result.error) errors.push(result.error);
  if (parsed.malformed_lines > 0) errors.push(`${parsed.malformed_lines}_malformed_ndjson_lines`);

  return {
    status: result.status,
    ok: result.ok,
    parsed,
    error: errors[0] ?? (result.ok ? undefined : publicHttpError(result.status ?? 0)),
    calls: result.calls,
    duration_ms: result.duration_ms,
  };
}
