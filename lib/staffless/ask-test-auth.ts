/**
 * Temporary Ask test-route gate. Fail closed unless explicitly enabled.
 * Timing-safe compare so a wrong token does not leak length via early return.
 */

import { timingSafeEqual } from "node:crypto";

export const ASK_TEST_MIN_TOKEN_CHARS = 32;
const ASK_TEST_WINDOW_MS = 5 * 60 * 1000;
const ASK_TEST_MAX_HITS = 20;

const askTestHits: number[] = [];

export type AskTestAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Authorize POST /api/ask/test from env. Never logs the token.
 * @param authorizationHeader - Raw Authorization header, or null.
 */
export function authorizeAskTest(authorizationHeader: string | null): AskTestAuthResult {
  if (process.env.ASK_TEST_ENABLED?.trim() !== "true") {
    return { ok: false, status: 404, error: "Not found" };
  }
  const expected = process.env.ASK_TEST_TOKEN?.trim() ?? "";
  if (expected.length < ASK_TEST_MIN_TOKEN_CHARS) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const provided = bearerToken(authorizationHeader);
  if (!tokensMatch(provided, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (!allowAskTestHit()) {
    return { ok: false, status: 429, error: "Too many test requests — try again in a few minutes" };
  }
  return { ok: true };
}

function bearerToken(header: string | null): string {
  if (!header) return "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? "";
}

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function allowAskTestHit(): boolean {
  const now = Date.now();
  while (askTestHits.length > 0 && now - (askTestHits[0] ?? 0) > ASK_TEST_WINDOW_MS) {
    askTestHits.shift();
  }
  if (askTestHits.length >= ASK_TEST_MAX_HITS) return false;
  askTestHits.push(now);
  return true;
}

/** Test-only: clear the in-memory window. */
export function resetAskTestRateLimit(): void {
  askTestHits.length = 0;
}
