/**
 * Temporary Ask test-route gate. Fail closed unless explicitly enabled.
 * Timing-safe compare so a wrong token does not leak length via early return.
 * No request-volume cap — a valid token may run a full benchmark without 429s.
 */

import { timingSafeEqual } from "node:crypto";

export const ASK_TEST_MIN_TOKEN_CHARS = 32;

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
