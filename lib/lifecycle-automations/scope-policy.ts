/**
 * Multi-scope ownership for Category A cron checks.
 *
 * Entity rows are shared; thresholds live on per-clerkUserId configs.
 * Resolution (after User.clerkUserId bridge):
 * - Approval → approver.clerkUserId
 * - Risk → riskOwner.clerkUserId
 * - Sign-off → releaseOwner.clerkUserId
 * - Blocker → always enterprise default (no reliable owner FK)
 *
 * Missing owner FK and missing bridge both use the same path:
 * `scopeSource: "fallback_default"` + enterprise default config.
 * Each record is processed once under one resolved scope only.
 */

/** How the day-limit for a processed record was chosen. */
export type LifecycleCronScopeSource = "owner" | "fallback_default";

/**
 * Hobby Vercel Cron: one daily invocation, ~10s function timeout.
 * Process at most this many candidates per check type per run (oldest first).
 * Remaining candidates are picked up on the next daily run (checks are idempotent).
 */
export const LIFECYCLE_CRON_BATCH_SIZE = 40;

/**
 * Resolve settings scope from an optional linked Clerk id.
 * Null/blank clerk id → fallback_default (same as "no owner on record").
 *
 * @param ownerClerkUserId - User.clerkUserId when an owner FK exists and is linked
 */
export function resolveCronScope(
  ownerClerkUserId: string | null | undefined
): { scopeSource: LifecycleCronScopeSource; clerkUserId: string | null } {
  const trimmed = ownerClerkUserId?.trim() || null;
  if (trimmed) {
    return { scopeSource: "owner", clerkUserId: trimmed };
  }
  return { scopeSource: "fallback_default", clerkUserId: null };
}
