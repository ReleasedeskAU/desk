/**
 * Named constants for Live WebSocket drop detection + reconnect backoff.
 */

/**
 * Gemini Live audio WebSockets are typically cut around ~10 minutes.
 * Remint with the resumption handle before that hard cut so the user
 * never sees an unexpected drop / orange "disconnected" flash.
 */
export const VOICE_AUDIO_PROACTIVE_RECONNECT_MS = 8 * 60_000;

/**
 * No server frame within this window ⇒ treat socket as stale and reconnect.
 * Must be long enough for normal pauses (user thinking / silence) — 45s was
 * killing mid-conversation sessions and forcing orange reconnect UI.
 */
export const VOICE_WS_STALE_MS = 5 * 60_000;

/** First reconnect delay after an unexpected drop. */
export const VOICE_RECONNECT_BASE_MS = 1_000;

/** Cap on exponential backoff between remints. */
export const VOICE_RECONNECT_MAX_MS = 16_000;

/** Give up auto-reconnect after this many failures in one lifecycle. */
export const VOICE_RECONNECT_MAX_ATTEMPTS = 8;

/** Soft mint cooldown when reminting after a drop (full cooldown still applies to cold starts). */
export const VOICE_RECONNECT_COOLDOWN_MS = 2_000;

/**
 * Exponential backoff delay for attempt index (0-based).
 * @param attempt - Reconnect attempt number starting at 0.
 */
export function voiceReconnectDelayMs(attempt: number): number {
  const exp = Math.min(
    VOICE_RECONNECT_MAX_MS,
    VOICE_RECONNECT_BASE_MS * 2 ** Math.max(0, attempt)
  );
  return exp;
}
