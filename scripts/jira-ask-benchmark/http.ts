/**
 * Timed HTTP POST with retries. Never logs Authorization or token values.
 */

import { backoffMs, sleep, type SlidingWindowLimiter } from "./rate-limit";
import type { HttpCallRecord } from "./types";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const ASK_STREAM_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 3;
const RETRY_STATUSES = new Set([408, 429, 502, 503, 504]);

export type JsonPostOpts = {
  url: string;
  token: string;
  body: unknown;
  timeoutMs?: number;
  limiter?: SlidingWindowLimiter;
  target: "ask";
  endpoint: string;
};

export type JsonPostResult = {
  status: number | null;
  ok: boolean;
  text: string;
  json: unknown;
  duration_ms: number;
  error?: string;
  calls: HttpCallRecord[];
};

/**
 * POST JSON and return text + parsed JSON when possible.
 * Retries transient failures with exponential backoff. Does not log headers.
 */
export async function jsonPost(opts: JsonPostOpts): Promise<JsonPostResult> {
  const calls: HttpCallRecord[] = [];
  let last: JsonPostResult | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (opts.limiter) await opts.limiter.acquire();
    const started = Date.now();
    const record: HttpCallRecord = {
      target: opts.target,
      endpoint: opts.endpoint,
      method: "POST",
      status: null,
      attempt: attempt + 1,
      duration_ms: 0,
    };
    try {
      const res = await fetchWithTimeout(opts);
      const text = await res.text();
      record.status = res.status;
      record.duration_ms = Date.now() - started;
      calls.push(record);
      last = {
        status: res.status,
        ok: res.ok,
        text,
        json: tryParseJson(text),
        duration_ms: record.duration_ms,
        error: res.ok ? undefined : publicHttpError(res.status),
        calls,
      };
      if (res.ok) return last;
      if (res.status === 401 || res.status === 403) return last;
      if (!RETRY_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS - 1) return last;
      if (res.status === 429) await sleep(Math.min(ASK_STREAM_TIMEOUT_MS, 60_000));
      else await sleep(backoffMs(attempt));
    } catch (err) {
      record.duration_ms = Date.now() - started;
      record.error = errorKind(err);
      calls.push(record);
      last = {
        status: null,
        ok: false,
        text: "",
        json: null,
        duration_ms: record.duration_ms,
        error: record.error,
        calls,
      };
      if (attempt === MAX_ATTEMPTS - 1) return last;
      await sleep(backoffMs(attempt));
    }
  }
  return last ?? {
    status: null,
    ok: false,
    text: "",
    json: null,
    duration_ms: 0,
    error: "request_failed",
    calls,
  };
}

async function fetchWithTimeout(opts: JsonPostOpts): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(opts.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        Accept: "application/json, application/x-ndjson, text/plain",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(opts.body),
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Client-safe HTTP error label. No response body (may contain internals).
 */
export function publicHttpError(status: number): string {
  if (status === 401 || status === 403) return "auth_error";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status === 502) return "bad_gateway";
  if (status === 503 || status === 504) return "upstream_unavailable";
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  return `http_${status}`;
}

function errorKind(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") return "timeout";
  if (err instanceof Error) return err.name || "network_error";
  return "network_error";
}
