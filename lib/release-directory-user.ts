/**
 * Map a Clerk session onto a directory User row.
 * Seat checks use the directory id (releaseOwnerId / releaseManagerId).
 */
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth/roles";
import type { DirectoryUserRef } from "@/lib/release-seats";

const DIRECTORY_SELECT = {
  id: true,
  userId: true,
  clerkUserId: true,
  email: true,
  name: true,
  accessLevel: true,
  role: true,
  status: true,
} as const;

/**
 * Find the directory user for this session. Clerk id first, then email.
 * Unprovisioned sessions have no seat.
 *
 * @param session - Authenticated session.
 */
export async function resolveDirectoryUser(session: SessionUser): Promise<DirectoryUserRef | null> {
  const clerk = session.id.trim();
  if (clerk) {
    const byClerk = await prisma.user.findUnique({
      where: { clerkUserId: clerk },
      select: DIRECTORY_SELECT,
    });
    if (byClerk) return byClerk;
  }
  const email = session.email.trim();
  if (!email) return null;
  return prisma.user.findUnique({
    where: { email },
    select: DIRECTORY_SELECT,
  });
}

/**
 * List same-tenant directory users for assignment pickers.
 * Today the app is not org-scoped — every directory User is same-tenant.
 */
export async function listDirectoryUsersForAssignment(): Promise<DirectoryUserRef[]> {
  return prisma.user.findMany({
    select: DIRECTORY_SELECT,
    orderBy: { name: "asc" },
  });
}
