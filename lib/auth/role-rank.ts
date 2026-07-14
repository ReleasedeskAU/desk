import type { UserRole, SessionUser } from "./roles";

/**
 * Ordered privilege ranks — higher number may perform more actions.
 * Used by requireRole / canEdit / canAdmin for least-privilege checks.
 */
export const ROLE_RANK: Record<UserRole, number> = {
  readonly: 0,
  editor: 1,
  admin: 2,
};

export function isUserRole(value: unknown): value is UserRole {
  return value === "readonly" || value === "editor" || value === "admin";
}

/**
 * Maps workbook Access Level (or similar) onto session privilege tiers.
 * Fail closed: unknown values become readonly.
 */
export function mapAccessLevelToRole(accessLevel: string | null | undefined): UserRole {
  const key = (accessLevel ?? "").trim().toLowerCase();
  if (key === "admin" || key === "executive") return "admin";
  if (key === "standard" || key === "editor") return "editor";
  if (key === "readonly" || key === "read only" || key === "viewer") return "readonly";
  return "readonly";
}

/** True when user meets or exceeds the minimum role. */
export function hasMinRole(user: SessionUser | null, minRole: UserRole): boolean {
  if (!user) return false;
  return ROLE_RANK[user.role] >= ROLE_RANK[minRole];
}
