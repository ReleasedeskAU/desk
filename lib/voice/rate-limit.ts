/**
 * Per-user cooldown for Gemini Live session minting (cost protection).
 * In-memory Map — same pattern as connector sync-now rate limit.
 * Suitable for single-instance; swap to Redis if multi-instance.
 */
import { VOICE_RECONNECT_COOLDOWN_MS } from "@/lib/voice/reconnect";

const lastMintByUser = new Map<string, number>();

/** Minimum gap between successful cold-start token mints for one Clerk user. */
export const VOICE_SESSION_COOLDOWN_MS = 15_000;

export type VoiceMintRateLimitOpts = {
  /**
   * Reconnect remints use a shorter cooldown so drops can recover promptly
   * without hammering the mint endpoint (backoff still applies client-side).
   */
  reconnect?: boolean;
};

/**
 * Check whether the user may mint a new voice session token.
 * @param clerkUserId - Clerk user id (SessionUser.id).
 * @param opts - Optional reconnect soft-cooldown.
 * @returns allowed + optional Retry-After seconds.
 */
export function checkVoiceSessionRateLimit(
  clerkUserId: string,
  opts: VoiceMintRateLimitOpts = {}
): {
  allowed: boolean;
  retryAfterSec?: number;
} {
  const now = Date.now();
  const last = lastMintByUser.get(clerkUserId) ?? 0;
  const elapsed = now - last;
  const cooldown = opts.reconnect
    ? VOICE_RECONNECT_COOLDOWN_MS
    : VOICE_SESSION_COOLDOWN_MS;
  if (elapsed < cooldown) {
    return {
      allowed: false,
      // Never surface a negative countdown (clock skew / HMR edge cases).
      retryAfterSec: Math.max(1, Math.ceil((cooldown - elapsed) / 1000)),
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
