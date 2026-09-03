/**
 * Server-only StaffLess AI connection settings.
 * PAT must never be NEXT_PUBLIC_* or returned to the browser.
 */

const DEFAULT_URL = "http://20.94.205.197";

/**
 * Base URL for the StaffLess AI (onyx-foss) nginx front door.
 * @returns Trimmed origin with no trailing slash.
 */
export function stafflessBaseUrl(): string {
  const raw =
    process.env.STAFFLESS_AI_URL?.trim() ||
    process.env.ONYX_SERVER_URL?.trim() ||
    DEFAULT_URL;
  return raw.replace(/\/+$/, "");
}

/**
 * Community PAT used as Authorization Bearer.
 * Accepts STAFFLESS_AI_PAT or ONYX_API_KEY (setup-onyx.sh name).
 * @returns PAT string, or null if unset.
 */
export function stafflessPat(): string | null {
  const pat =
    process.env.STAFFLESS_AI_PAT?.trim() || process.env.ONYX_API_KEY?.trim() || "";
  return pat.length > 0 ? pat : null;
}
