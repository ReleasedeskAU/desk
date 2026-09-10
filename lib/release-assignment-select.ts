/**
 * Client-safe mapping of tenant-scoped assignment rows onto select options.
 * Keep this file free of Prisma / Clerk / Node APIs so Create/Edit Release can import it.
 */

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
