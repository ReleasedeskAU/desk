import { hasMinRole } from "./role-rank";

export type UserRole = "readonly" | "editor" | "admin";

export interface SessionUser {
  /** Stable Clerk user id — use for per-user preferences (filters, columns, etc.) */
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export const SESSION_COOKIE = "sentinel-session";

export const ROLE_LABELS: Record<UserRole, string> = {
  readonly: "Read only",
  editor: "Editor",
  admin: "Admin",
};

/** Editor+ may mutate operational data. */
export function canEdit(user: SessionUser | null): boolean {
  return hasMinRole(user, "editor");
}

/** Admin-only: user admin, connectors, destructive ops. */
export function canAdmin(user: SessionUser | null): boolean {
  return hasMinRole(user, "admin");
}
