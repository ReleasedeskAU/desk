/**
 * POST /api/copilot/voice/session
 * Mints a Gemini Live ephemeral token for the signed-in Clerk user.
 * Returns { token, toolManifest } — never the GEMINI_API_KEY.
 * Manifest (Phase 3): navigate_to, search_entity, get_summary, propose_action, confirm_action.
 *
 * Auth: requireSession.
 * Cost: per-user mint cooldown + daily session ceiling.
 * Reconnect: X-Voice-Reconnect: 1 → soft cooldown, no extra daily count; always remints fresh token.
 * Security: cold-start remint invalidates pending propose_action rows; reconnect remint keeps them
 * (same logical session / resumption handle).
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { requireSession } from "@/lib/auth/api";
import { jsonError } from "@/lib/api-errors";
import { mintVoiceEphemeralToken } from "@/lib/voice/ephemeral-token";
import {
  checkVoiceSessionRateLimit,
  markVoiceSessionMinted,
} from "@/lib/voice/rate-limit";
import { invalidatePendingVoiceActionsForUser } from "@/lib/voice/action-store";
import {
  checkVoiceDailySessionCeiling,
  recordVoiceSessionStart,
  VOICE_MAX_SESSION_DURATION_MS,
  VOICE_MAX_SESSIONS_PER_USER_PER_DAY,
} from "@/lib/voice/usage";
import { VOICE_TOOL_MANIFEST } from "@/lib/voice/tool-manifest";

export async function POST(req: Request) {
  const { user, error } = await requireSession();
  if (error) return error;

  const reconnect =
    req.headers.get("x-voice-reconnect")?.trim() === "1" ||
    req.headers.get("X-Voice-Reconnect")?.trim() === "1";

  if (!reconnect) {
    const ceiling = checkVoiceDailySessionCeiling(user!.id);
    if (!ceiling.allowed) {
      return NextResponse.json(
        {
          error: ceiling.reason,
          sessionCount: ceiling.sessionCount,
          maxSessions: ceiling.maxSessions,
          code: "daily_session_ceiling",
        },
        { status: 429 }
      );
    }
  }

  const limited = checkVoiceSessionRateLimit(user!.id, { reconnect });
  if (!limited.allowed) {
    return NextResponse.json(
      {
        error: "Voice session rate limit — try again shortly",
        retryAfterSec: limited.retryAfterSec,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(limited.retryAfterSec ?? 15),
        },
      }
    );
  }

  let organizationId: string | null = null;
  try {
    const a = await auth();
    organizationId = a.orgId ?? null;
  } catch {
    organizationId = null;
  }

  try {
    const minted = await mintVoiceEphemeralToken();
    markVoiceSessionMinted(user!.id);
    // Cold starts must not leave confirmable proposals from a prior mic session.
    // Reconnect remints keep pending proposes — same logical Live conversation.
    const invalidated = reconnect
      ? 0
      : invalidatePendingVoiceActionsForUser(user!.id);
    const usage = reconnect
      ? undefined
      : recordVoiceSessionStart(user!.id);

    return NextResponse.json({
      token: minted.token,
      toolManifest: VOICE_TOOL_MANIFEST,
      model: minted.model,
      expireTime: minted.expireTime,
      organizationId,
      reconnect,
      invalidatedPendingActions: invalidated,
      maxSessionDurationMs: VOICE_MAX_SESSION_DURATION_MS,
      maxSessionsPerDay: VOICE_MAX_SESSIONS_PER_USER_PER_DAY,
      usage: usage ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (/GEMINI_API_KEY is not configured/i.test(message)) {
      return NextResponse.json(
        { error: "Voice is not configured on this server (missing GEMINI_API_KEY)" },
        { status: 503 }
      );
    }
    return jsonError(err, {
      publicMessage: "Failed to mint voice session token",
      status: 502,
      logLabel: "voice.session.mint",
    });
  }
}
