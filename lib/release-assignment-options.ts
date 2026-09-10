/**
 * Session-tenant Manager / Owner picker lists (server-only).
 * Same source as release GET `assignmentOptions` — never an unscoped user directory.
 * Do not import this module from Client Components (Prisma + Clerk server).
 */

import type { SessionUser } from "@/lib/auth/roles";
import { listDirectoryUsersForAssignment } from "@/lib/release-directory-user";
import { pickerPayload, type ReleaseAssignmentOptions } from "@/lib/release-scope-service";
import { resolveScopeTenant } from "@/lib/release-scope-tenant";

/**
 * Tenant-scoped assignment options for the session.
 * Same org as release list/detail GET. Empty when the session has no tenant.
 *
 * @param session - Authenticated session.
 */
export async function loadSessionAssignmentOptions(
  session: SessionUser
): Promise<ReleaseAssignmentOptions> {
  const tenant = await resolveScopeTenant(session);
  if (!tenant) return pickerPayload([]);
  return pickerPayload(await listDirectoryUsersForAssignment(tenant.organizationId));
}
