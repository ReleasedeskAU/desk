/**
 * Voice super-admin gate — stricter than role=admin.
 * Only the allowlisted mailbox may manage /admin-voice policies.
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api";
import type { SessionUser } from "@/lib/auth/roles";

/** Sole mailbox allowed to administer voice bans and minute limits. */
export const VOICE_SUPER_ADMIN_EMAIL = "admin@releasedesk.com.au";

/**
 * Whether the session email is the voice super-admin (case-insensitive).
 * @param email - Session user email.
 */
export function isVoiceSuperAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === VOICE_SUPER_ADMIN_EMAIL;
}

/**
 * Requires an authenticated session whose email is the voice super-admin.
 * @returns `{ user, error }` — if error is set, return it from the route handler.
 */
export async function requireVoiceSuperAdmin(): Promise<{
  user: SessionUser | null;
  error: NextResponse | null;
}> {
  const { user, error } = await requireSession();
  if (error) return { user: null, error };
  if (!isVoiceSuperAdminEmail(user!.email)) {
    return {
      user,
      error: NextResponse.json(
        { error: "Forbidden — voice admin access only" },
        { status: 403 }
      ),
    };
  }
  return { user, error: null };
}
