/**
 * Map a Clerk session onto a directory User row.
 * Seat checks use the directory id (releaseOwnerId / releaseManagerId).
 */
import type { SessionUser } from "@/lib/auth/roles";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { DirectoryUserRef } from "@/lib/release-seats";
import { isReleaseTenantScopeEnabled } from "@/lib/release-tenant-scope-flag";

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

function toDirectoryUserRef(row: DirectoryUserRow): DirectoryUserRef {
  return {
    id: row.id,
    userId: row.userId,
    clerkUserId: row.clerkUserId,
    email: row.email,
    name: row.name,
    accessLevel: row.accessLevel,
    role: row.role,
    status: row.status,
  };
}

/**
 * List directory users for assignment pickers and grants.
 * Tenant on: exact organizationId match; missing org → empty list.
 * Tenant off: every directory user (temporary until RELEASE_TENANT_SCOPE=on).
 *
 * @param organizationId - Session organization id (ignored while tenant scope is off).
 */
export async function listDirectoryUsersForAssignment(
  organizationId: string | null
): Promise<DirectoryUserRef[]> {
  try {
    if (!isReleaseTenantScopeEnabled()) {
      const rows = await prisma.$queryRaw<DirectoryUserRow[]>`
        SELECT id, "userId", "clerkUserId", email, name, "accessLevel", role, status
        FROM "User"
        ORDER BY name ASC, email ASC
      `;
      return rows.map(toDirectoryUserRef);
    }
    const orgId = assignmentDirectoryOrganizationId(organizationId);
    if (!orgId) return [];
    // User.organizationId exists on live Neon but is omitted from the vendored Prisma model.
    const rows = await prisma.$queryRaw<DirectoryUserRow[]>`
      SELECT id, "userId", "clerkUserId", email, name, "accessLevel", role, status
      FROM "User"
      WHERE "organizationId" = ${orgId}
      ORDER BY name ASC, email ASC
    `;
    return rows.map(toDirectoryUserRef);
  } catch (error) {
    logger.warn("directory assignment list: tenant-scoped user query failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}
