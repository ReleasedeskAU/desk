/**
 * Origins Clerk may treat as this app (azp / redirect allow-list).
 * Production users open desk-release-desk1.vercel.app — that host must be
 * included or the SignIn widget stays blank and session JWTs fail handshake.
 * Do not accept a client-supplied origin.
 */

/** Hosts users actually open in production (protocol added by toAbsoluteOrigin). */
export const CLERK_KNOWN_PRODUCTION_HOSTS = [
  "desk-release-desk1.vercel.app",
  "releasedesk.vercel.app",
] as const;

/**
 * Absolute https origin, or null when the value is empty.
 *
 * @param value - Host or full URL from env / config (never a user-supplied origin).
 */
export function toAbsoluteOrigin(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Deduped Clerk authorized parties from env + known production aliases.
 *
 * @param extras - Additional trusted origins (e.g. this request’s host on Vercel).
 */
export function clerkAuthorizedOrigins(extras: Array<string | null | undefined> = []): string[] {
  const parties = new Set<string>();
  const add = (v?: string | null) => {
    const origin = toAbsoluteOrigin(v);
    if (origin) parties.add(origin);
  };

  add(process.env.NEXT_PUBLIC_APP_URL);
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  add(process.env.VERCEL_URL);
  for (const host of CLERK_KNOWN_PRODUCTION_HOSTS) add(host);
  for (const extra of extras) add(extra);

  return [...parties];
}
