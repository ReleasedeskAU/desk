/**
 * Display helpers for release stakeholders (User join rows).
 */

export type StakeholderUserRef = {
  name?: string | null;
  userId?: string | null;
};

/**
 * Join stakeholder names for UI. Falls back to the directory id only when name is blank.
 *
 * @param stakeholders - Linked users (detail/list payloads).
 * @returns Comma-separated names, or "—" when none.
 */
export function formatStakeholderNames(
  stakeholders:
    | Array<{ user?: StakeholderUserRef | null } | null | undefined>
    | null
    | undefined
): string {
  if (!stakeholders?.length) return "—";
  const labels = stakeholders
    .map((row) => {
      const name = row?.user?.name?.trim();
      if (name) return name;
      const id = row?.user?.userId?.trim();
      return id || "";
    })
    .filter(Boolean);
  return labels.length ? labels.join(", ") : "—";
}
