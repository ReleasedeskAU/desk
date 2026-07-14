import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { SessionUser, UserRole } from "./roles";
import { isUserRole, mapAccessLevelToRole } from "./role-rank";

export { encodeSession, parseSession } from "./cookie";

/**
 * Resolves app privilege tier for the signed-in Clerk user.
 * Priority: Clerk publicMetadata.sentinelRole|role → DB User.accessLevel by email →
 * SENTINEL_DEFAULT_AUTH_ROLE env → readonly (deny by default).
 */
async function resolveRole(email: string, metadata: Record<string, unknown> | undefined): Promise<UserRole> {
  const fromMeta = metadata?.sentinelRole ?? metadata?.role;
  if (isUserRole(fromMeta)) return fromMeta;

  if (email) {
    try {
      const row = await prisma.user.findUnique({
        where: { email },
        select: { accessLevel: true },
      });
      if (row?.accessLevel) return mapAccessLevelToRole(row.accessLevel);
    } catch {
      // DB unavailable — fall through to default; session remains valid for auth gate
    }
  }

  const fromEnv = process.env.SENTINEL_DEFAULT_AUTH_ROLE;
  if (isUserRole(fromEnv)) return fromEnv;

  // Fail closed: authenticated but unmapped users are read-only until provisioned.
  return "readonly";
}

/**
 * Returns the current Clerk session as a SessionUser, or null if unauthenticated.
 * Side effects: may query Prisma for role mapping by email.
 */
export async function getSession(): Promise<SessionUser | null> {
  let userId: string | null | undefined;
  try {
    ({ userId } = await auth());
  } catch {
    return null;
  }
  if (!userId) return null;

  let email = "";
  let name = "User";
  let metadata: Record<string, unknown> | undefined;

  try {
    const clerkUser = await currentUser();
    if (clerkUser) {
      email =
        clerkUser.primaryEmailAddress?.emailAddress ??
        clerkUser.emailAddresses[0]?.emailAddress ??
        "";
      name =
        clerkUser.fullName?.trim() ||
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
        (email ? email.split("@")[0] : "") ||
        "User";
      metadata = clerkUser.publicMetadata as Record<string, unknown> | undefined;
    }
  } catch {
    // Clerk API unreachable (network blip) — keep session valid for polling routes
  }

  const role = await resolveRole(email, metadata);

  return {
    id: userId,
    email,
    name,
    role,
  };
}
