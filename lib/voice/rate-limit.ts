/**
 * Per-user cooldown for Gemini Live session minting (cost protection).
 * In-memory Map — same pattern as connector sync-now rate limit.
 * Suitable for single-instance / Phase 0; swap to Redis in Phase 4 if multi-instance.
 */

const lastMintByUser = new Map<string, number>();

/** Minimum gap between successful token mints for one Clerk user. */
export const VOICE_SESSION_COOLDOWN_MS = 15_000;

/**
 * Check whether the user may mint a new voice session token.
 * @param clerkUserId - Clerk user id (SessionUser.id).
 * @returns allowed + optional Retry-After seconds.
 */
export function checkVoiceSessionRateLimit(clerkUserId: string): {
  allowed: boolean;
  retryAfterSec?: number;
} {
  const now = Date.now();
  const last = lastMintByUser.get(clerkUserId) ?? 0;
  const elapsed = now - last;
  if (elapsed < VOICE_SESSION_COOLDOWN_MS) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((VOICE_SESSION_COOLDOWN_MS - elapsed) / 1000),
    };
  }
  return { allowed: true };
}

/**
 * Record a successful mint so the cooldown starts.
 * @param clerkUserId - Clerk user id.
 */
export function markVoiceSessionMinted(clerkUserId: string): void {
  lastMintByUser.set(clerkUserId, Date.now());
}

/** Test-only: clear cooldown map. */
export function _resetVoiceSessionRateLimitForTests(): void {
  lastMintByUser.clear();
}
