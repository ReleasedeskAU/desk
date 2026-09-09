/**
 * Session-tenant Manager / Owner picker lists.
 * Same source as release GET `assignmentOptions` — never an unscoped user directory.
 */

import type { SessionUser } from "@/lib/auth/roles";
import { listDirectoryUsersForAssignment } from "@/lib/release-directory-user";
import { pickerPayload, type ReleaseAssignmentOptions } from "@/lib/release-scope-service";
import { resolveScopeTenant } from "@/lib/release-scope-tenant";

/**
 * Tenant-scoped assignment options for the session.
 * Missing tenant → null (caller must deny or show an empty picker).
 *
 * @param session - Authenticated session.
 */
export async function loadSessionAssignmentOptions(
  session: SessionUser
): Promise<ReleaseAssignmentOptions | null> {
  const tenant = await resolveScopeTenant(session);
  if (!tenant) return null;
  return pickerPayload(await listDirectoryUsersForAssignment(tenant.organizationId));
}

/**
 * Map assignment options onto SearchableSelect values.
 *
 * @param rows - Managers or owners from the tenant-scoped payload.
 */
export function assignmentOptionsToSelect(
  rows: { id: string; label: string }[] | undefined
): { value: string; label: string }[] {
  return (rows ?? []).map((row) => ({ value: row.id, label: row.label }));
}
