/**
 * Per-user (tenant) labels for native scope statuses.
 * Logic never matches English "Draft" / "Approved".
 */
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SCOPE_SECTION_CONFIG,
  parseScopeSectionConfig,
  type ScopeSectionConfig,
} from "@/lib/release-scope-status";

/**
 * Load scope-section labels for the caller. Missing row → defaults.
 *
 * @param clerkUserId - Session Clerk id.
 */
export async function loadScopeSectionConfig(clerkUserId: string): Promise<ScopeSectionConfig> {
  const trimmed = clerkUserId.trim();
  if (!trimmed) return DEFAULT_SCOPE_SECTION_CONFIG;
  try {
    const row = await prisma.userScopeSectionConfig.findUnique({
      where: { clerkUserId: trimmed },
      select: { snapshot: true },
    });
    return parseScopeSectionConfig(row?.snapshot);
  } catch (err) {
    console.error("[scope-section-config] load failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return DEFAULT_SCOPE_SECTION_CONFIG;
  }
}
