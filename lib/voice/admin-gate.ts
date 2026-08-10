/**
 * Voice super-admin gate — stricter than role=admin.
 * Only the allowlisted mailbox may manage /admin-voice policies.
 * Client-safe helpers live in admin-gate-constants (do not import this file from client components).
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api";
import type { SessionUser } from "@/lib/auth/roles";
import { isVoiceSuperAdminEmail } from "@/lib/voice/admin-gate-constants";

export {
  VOICE_SUPER_ADMIN_EMAIL,
  isVoiceSuperAdminEmail,
} from "@/lib/voice/admin-gate-constants";

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
