/**
 * Voice session usage tracking + hard ceilings (Phase 4 hardening).
 * In-memory per process — same pattern as mint cooldown; swap to Redis later if multi-instance.
 *
 * Cost grounding (Gemini 3.1 Flash Live preview, published ~$/min audio):
 *   VOICE_AUDIO_INPUT_USD_PER_MIN  ≈ $0.005
 *   VOICE_AUDIO_OUTPUT_USD_PER_MIN ≈ $0.018
 *   Combined full-duplex worst case ≈ $0.023 / min
 *
 * Defaults:
 *   Max session 15 min → ≤ ~$0.35 worst-case per session
 *   Max 40 sessions/user/day → ≤ ~$13.80/user/day worst-case if every session is full 15 min duplex
 *   Realistic mix (shorter sessions) is typically well under that ceiling.
 */

/** Published-equivalent audio input rate used for ceiling math ($/min). */
export const VOICE_AUDIO_INPUT_USD_PER_MIN = 0.005;

/** Published-equivalent audio output rate used for ceiling math ($/min). */
export const VOICE_AUDIO_OUTPUT_USD_PER_MIN = 0.018;

/** Worst-case duplex burn rate for planning ($/min). */
export const VOICE_AUDIO_DUPLEX_USD_PER_MIN =
  VOICE_AUDIO_INPUT_USD_PER_MIN + VOICE_AUDIO_OUTPUT_USD_PER_MIN;

/** Hard cap on a single Live session length. */
export const VOICE_MAX_SESSION_DURATION_MS = 15 * 60 * 1000;

/** Max successful session mints per Clerk user per UTC day. */
export const VOICE_MAX_SESSIONS_PER_USER_PER_DAY = 40;

/** How often the client should heartbeat while connected. */
export const VOICE_USAGE_HEARTBEAT_MS = 30_000;

export type VoiceUserUsage = {
  userId: string;
  dayKey: string;
  sessionCount: number;
  /** Accumulated connected time (ms) reported via heartbeats / end. */
  durationMs: number;
  lastSessionAt: number | null;
};

type DayBucket = {
  dayKey: string;
  sessionCount: number;
  durationMs: number;
  lastSessionAt: number | null;
};

const byUser = new Map<string, DayBucket>();

/**
 * UTC day key YYYY-MM-DD.
 * @param now - Epoch ms.
 */
export function voiceUsageDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function bucket(userId: string, now = Date.now()): DayBucket {
  const dayKey = voiceUsageDayKey(now);
  const existing = byUser.get(userId);
  if (!existing || existing.dayKey !== dayKey) {
    const fresh: DayBucket = {
      dayKey,
      sessionCount: 0,
      durationMs: 0,
      lastSessionAt: null,
    };
    byUser.set(userId, fresh);
    return fresh;
  }
  return existing;
}

/**
 * Whether the user may start another voice session today.
 * @param clerkUserId - Clerk user id.
 */
export function checkVoiceDailySessionCeiling(clerkUserId: string): {
  allowed: boolean;
  sessionCount: number;
  maxSessions: number;
  reason?: string;
} {
  const b = bucket(clerkUserId);
  if (b.sessionCount >= VOICE_MAX_SESSIONS_PER_USER_PER_DAY) {
    return {
      allowed: false,
      sessionCount: b.sessionCount,
      maxSessions: VOICE_MAX_SESSIONS_PER_USER_PER_DAY,
      reason: `Daily voice session limit reached (${VOICE_MAX_SESSIONS_PER_USER_PER_DAY}/day)`,
    };
  }
  return {
    allowed: true,
    sessionCount: b.sessionCount,
    maxSessions: VOICE_MAX_SESSIONS_PER_USER_PER_DAY,
  };
}

/**
 * Record a successful session mint toward the daily ceiling.
 * @param clerkUserId - Clerk user id.
 */
export function recordVoiceSessionStart(clerkUserId: string): VoiceUserUsage {
  const b = bucket(clerkUserId);
  b.sessionCount += 1;
  b.lastSessionAt = Date.now();
  return getVoiceUserUsage(clerkUserId);
}

/**
 * Add connected duration from a client heartbeat or session end.
 * @param clerkUserId - Clerk user id.
 * @param deltaMs - Elapsed ms since last heartbeat (clamped).
 */
export function recordVoiceSessionHeartbeat(
  clerkUserId: string,
  deltaMs: number
): VoiceUserUsage {
  const b = bucket(clerkUserId);
  const clamped = Math.max(0, Math.min(deltaMs, VOICE_USAGE_HEARTBEAT_MS * 3));
  b.durationMs += clamped;
  return getVoiceUserUsage(clerkUserId);
}

/**
 * Snapshot for one user (current UTC day).
 * @param clerkUserId - Clerk user id.
 */
export function getVoiceUserUsage(clerkUserId: string): VoiceUserUsage {
  const b = bucket(clerkUserId);
  return {
    userId: clerkUserId,
    dayKey: b.dayKey,
    sessionCount: b.sessionCount,
    durationMs: b.durationMs,
    lastSessionAt: b.lastSessionAt,
  };
}

/**
 * All users with usage today (admin listing).
 */
export function listVoiceUsageToday(): VoiceUserUsage[] {
  const dayKey = voiceUsageDayKey();
  const out: VoiceUserUsage[] = [];
  for (const [userId, b] of byUser) {
    if (b.dayKey !== dayKey) continue;
    out.push({
      userId,
      dayKey: b.dayKey,
      sessionCount: b.sessionCount,
      durationMs: b.durationMs,
      lastSessionAt: b.lastSessionAt,
    });
  }
  return out.sort((a, b) => b.sessionCount - a.sessionCount);
}

/**
 * Worst-case USD estimate for planning (full duplex at max session length).
 * @param sessions - Session count.
 * @param minutesPerSession - Assumed length (defaults to max).
 */
export function estimateVoiceWorstCaseUsd(
  sessions: number,
  minutesPerSession = VOICE_MAX_SESSION_DURATION_MS / 60_000
): number {
  return sessions * minutesPerSession * VOICE_AUDIO_DUPLEX_USD_PER_MIN;
}

/** Test-only reset. */
export function _resetVoiceUsageForTests(): void {
  byUser.clear();
}
