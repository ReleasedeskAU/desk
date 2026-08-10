/**
 * Client-safe Voice super-admin allowlist helpers.
 * Keep server-only auth imports out of this file (used by /admin-voice UI).
 */

/** Sole mailbox allowed to administer voice bans and minute limits. */
export const VOICE_SUPER_ADMIN_EMAIL = "admin@releasedesk.com.au";

/**
 * Whether the session email is the voice super-admin (case-insensitive).
 * @param email - Session user email.
 */
export function isVoiceSuperAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === VOICE_SUPER_ADMIN_EMAIL;
}
