/**
 * HTTP client for StaffLess AI. Server-side only — PAT never leaves this module.
 */

import { logger } from "@/lib/logger";
import { stafflessBaseUrl, stafflessPat } from "@/lib/staffless/config";

export class StafflessConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StafflessConfigError";
  }
}

export class StafflessApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "StafflessApiError";
    this.status = status;
  }
}

type JsonBody = Record<string, unknown> | unknown[];

/**
 * Call StaffLess AI with the server PAT. Prefer `/api/...` paths (nginx strips `/api`).
 * @param path - Absolute path beginning with `/`.
 * @param init - Fetch options; JSON body is serialized when `json` is set.
 * @returns Parsed JSON, or null for empty 204.
 * @throws StafflessConfigError when PAT is missing.
 * @throws StafflessApiError on non-2xx.
 */
export async function stafflessFetch<T>(
  path: string,
  init: { method?: string; json?: JsonBody; timeoutMs?: number } = {}
): Promise<T> {
  const pat = stafflessPat();
  if (!pat) {
    throw new StafflessConfigError("StaffLess AI PAT is not configured");
  }
  if (!path.startsWith("/")) {
    throw new StafflessConfigError("StaffLess AI path must be absolute");
  }

  const url = `${stafflessBaseUrl()}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, {
      method: init.method ?? (init.json ? "POST" : "GET"),
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/json",
        ...(init.json ? { "Content-Type": "application/json" } : {}),
      },
      body: init.json ? JSON.stringify(init.json) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      logger.warn("staffless.fetch_failed", { status: res.status, path });
      throw new StafflessApiError(res.status, publicStafflessError(res.status));
    }
    if (!text) return null as T;
    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof StafflessApiError || err instanceof StafflessConfigError) throw err;
    logger.error("staffless.fetch_error", { path, kind: err instanceof Error ? err.name : "unknown" });
    throw new StafflessApiError(502, "StaffLess AI is unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generic client-facing error — never include StaffLess body (may leak internals).
 */
export function publicStafflessError(status: number): string {
  if (status === 401 || status === 403) return "StaffLess AI rejected the request";
  if (status === 404) return "StaffLess AI resource not found";
  if (status === 409) return "StaffLess AI reported a conflict";
  if (status >= 400 && status < 500) return "StaffLess AI rejected the request";
  return "StaffLess AI is unavailable";
}

export function stafflessHttpStatus(err: unknown): number {
  if (err instanceof StafflessConfigError) return 503;
  if (err instanceof StafflessApiError) return err.status >= 400 ? Math.min(err.status, 502) : 502;
  return 502;
}

export function stafflessPublicMessage(err: unknown): string {
  if (err instanceof StafflessConfigError) return "StaffLess AI is not configured";
  if (err instanceof StafflessApiError) return err.message;
  return "StaffLess AI is unavailable";
}
