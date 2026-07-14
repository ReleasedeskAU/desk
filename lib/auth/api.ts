import { NextResponse } from "next/server";
import { getSession } from "./session";
import { hasMinRole } from "./role-rank";
import type { UserRole } from "./roles";

/**
 * Requires an authenticated Clerk session.
 * @returns `{ user, error }` — if error is set, return it from the route handler.
 */
export async function requireSession() {
  const user = await getSession();
  if (!user) {
    return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user, error: null };
}

/**
 * Requires authentication and a minimum privilege tier (deny by default).
 * @param minRole - Lowest role allowed for this endpoint.
 */
export async function requireRole(minRole: UserRole) {
  const { user, error } = await requireSession();
  if (error) return { user: null, error };
  if (!hasMinRole(user, minRole)) {
    return {
      user,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { user, error: null };
}
