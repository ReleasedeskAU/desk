/**
 * GET /api/release-assignment-options
 *
 * Session-tenant Manager / Owner picker lists for Create Release
 * (no release id yet). Same payload as release GET `assignmentOptions`.
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api";
import { loadSessionAssignmentOptions } from "@/lib/release-assignment-options";

/**
 * Return tenant-scoped assignment pickers. Fail closed when the session
 * cannot be placed in a tenant.
 */
export async function GET() {
  const { user, error } = await requireSession();
  if (error || !user) return error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const options = await loadSessionAssignmentOptions(user);
  if (!options) {
    return NextResponse.json({ error: "Tenant required", code: "TENANT_REQUIRED" }, { status: 403 });
  }
  return NextResponse.json(options);
}
