/**
 * Wave 4: persist the status key beside the display label.
 * Aliases resolve at the boundary (import / create / PATCH) then we store both.
 * Runtime matching prefers `statusKey` when present; `status` stays the label.
 */

/**
 * Pair a resolved lifecycle status for Prisma create/update.
 * @param resolved - Status from the live graph (key + label).
 */
export function persistResolvedStatus(resolved: {
  key: string;
  label: string;
}): { status: string; statusKey: string } {
  return { status: resolved.label, statusKey: resolved.key };
}
