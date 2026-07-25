/**
 * POST /api/copilot/voice/session
 * Mints a Gemini Live ephemeral token for the signed-in Clerk user.
 * Returns { token, toolManifest } — never the GEMINI_API_KEY.
 * Manifest (Phase 3): navigate_to, search_entity, get_summary, propose_action, confirm_action.
 *
 * Auth: requireSession (same pattern as appearance / risk-engine-config).
 * Org: optional orgId from Clerk auth() when present (unenforced).
 * Cost: per-user cooldown before minting.
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
import { VOICE_TOOL_MANIFEST } from "@/lib/voice/tool-manifest";

export async function POST() {
  const { user, error } = await requireSession();
  if (error) return error;

  const limited = checkVoiceSessionRateLimit(user!.id);
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

  // Optional org context (Clerk) — never required for Phase 0.
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

    // Response must not include GEMINI_API_KEY or any secret env values.
    return NextResponse.json({
      token: minted.token,
      toolManifest: VOICE_TOOL_MANIFEST,
      model: minted.model,
      expireTime: minted.expireTime,
      organizationId,
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
