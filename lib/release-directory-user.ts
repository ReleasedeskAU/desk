/**
 * Map a Clerk session onto a directory User row.
 * Seat checks use the directory id (releaseOwnerId / releaseManagerId).
 */
import type { SessionUser } from "@/lib/auth/roles";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
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
 * Organization id required to list assignment candidates. Empty input is not a tenant.
 *
 * @param organizationId - Session organization id.
 */
export function assignmentDirectoryOrganizationId(
  organizationId: string | null | undefined
): string | null {
  if (typeof organizationId !== "string") return null;
  const trimmed = organizationId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type DirectoryUserRow = {
  id: string;
  userId: string;
  clerkUserId: string | null;
  email: string;
  name: string;
  accessLevel: string;
  role: string;
  status: string;
};

/**
 * List directory users in the session tenant for assignment pickers and grants.
 * Fail closed: missing organization id or an unreadable org column → empty list.
 * Never returns every directory user.
 *
 * @param organizationId - Session organization id (required).
 */
export async function listDirectoryUsersForAssignment(
  organizationId: string
): Promise<DirectoryUserRef[]> {
  const orgId = assignmentDirectoryOrganizationId(organizationId);
  if (!orgId) return [];

  try {
    // User.organizationId exists on live Neon but is omitted from the vendored Prisma model.
    const rows = await prisma.$queryRaw<DirectoryUserRow[]>`
      SELECT id, "userId", "clerkUserId", email, name, "accessLevel", role, status
      FROM "User"
      WHERE "organizationId" = ${orgId}
      ORDER BY name ASC, email ASC
    `;
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      clerkUserId: row.clerkUserId,
      email: row.email,
      name: row.name,
      accessLevel: row.accessLevel,
      role: row.role,
      status: row.status,
    }));
  } catch (error) {
    logger.warn("directory assignment list: tenant-scoped user query failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}
