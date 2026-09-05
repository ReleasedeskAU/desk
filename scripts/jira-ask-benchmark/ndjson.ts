/**
 * Parse Ask NDJSON without logging request headers or tokens.
 */

import type { AskGrounding, AskParsed } from "./types";

const GROUNDING_KINDS = new Set<AskGrounding>(["verified", "search", "mixed"]);

/**
 * Split a stream body into lines and parse one JSON object per line.
 * Concatenates `type:text` payloads in order. Malformed lines are counted, not thrown.
 * @param body - Raw response text.
 * @returns Structured Ask events plus concatenated answer text.
 */
export function parseAskNdjson(body: string): AskParsed {
  const parsed: AskParsed = {
    session_id: null,
    grounding: null,
    text: "",
    status_events: [],
    session_event: null,
    grounding_event: null,
    done_event: null,
    error_event: null,
    other_events: [],
    malformed_lines: 0,
    parse_errors: [],
  };
  const textParts: string[] = [];
  const lines = body.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      parsed.malformed_lines += 1;
      parsed.parse_errors.push("malformed_ndjson_line");
      continue;
    }
    if (!obj || typeof obj !== "object") {
      parsed.malformed_lines += 1;
      parsed.parse_errors.push("ndjson_line_not_object");
      continue;
    }
    absorbEvent(parsed, textParts, obj as Record<string, unknown>);
  }
  parsed.text = textParts.join("");
  return parsed;
}

function absorbEvent(parsed: AskParsed, textParts: string[], obj: Record<string, unknown>): void {
  const type = typeof obj.type === "string" ? obj.type : "";
  if (type === "text") {
    if (typeof obj.text === "string") textParts.push(obj.text);
    return;
  }
  if (type === "session") {
    parsed.session_event = obj;
    if (typeof obj.sessionId === "string" && obj.sessionId) parsed.session_id = obj.sessionId;
    return;
  }
  if (type === "status") {
    parsed.status_events.push({ phase: typeof obj.phase === "string" ? obj.phase : "unknown" });
    return;
  }
  if (type === "grounding") {
    parsed.grounding_event = obj;
    const kind = obj.kind;
    if (typeof kind === "string" && GROUNDING_KINDS.has(kind as AskGrounding)) {
      parsed.grounding = kind as AskGrounding;
    }
    return;
  }
  if (type === "done") {
    parsed.done_event = obj;
    return;
  }
  if (type === "error") {
    parsed.error_event = obj;
    return;
  }
  parsed.other_events.push(obj);
}

/**
 * Whether Ask returned answer text another reviewer can compare to Jira.
 * Does not judge correctness.
 */
export function isPassableForComparison(askText: string): boolean {
  return askText.trim().length > 0;
}
