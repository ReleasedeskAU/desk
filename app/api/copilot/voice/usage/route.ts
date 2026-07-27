/**
 * GET /api/copilot/voice/usage
 * Admin: list today's in-memory voice usage + cost ceilings for planning.
 * Self (any signed-in): returns only the caller's day bucket when ?self=1.
 */
import { NextResponse } from "next/server";
import { requireRole, requireSession } from "@/lib/auth/api";
import {
  estimateVoiceWorstCaseUsd,
  getVoiceUserUsage,
  listVoiceUsageToday,
  VOICE_AUDIO_DUPLEX_USD_PER_MIN,
  VOICE_AUDIO_INPUT_USD_PER_MIN,
  VOICE_AUDIO_OUTPUT_USD_PER_MIN,
  VOICE_MAX_SESSION_DURATION_MS,
  VOICE_MAX_SESSIONS_PER_USER_PER_DAY,
} from "@/lib/voice/usage";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const selfOnly = url.searchParams.get("self") === "1";

  if (selfOnly) {
    const { user, error } = await requireSession();
    if (error) return error;
    const usage = getVoiceUserUsage(user!.id);
    return NextResponse.json({
      usage,
      ceilings: ceilingsPayload(),
      costRates: costRatesPayload(),
    });
  }

  const { error } = await requireRole("admin");
  if (error) return error;

  const users = listVoiceUsageToday();
  return NextResponse.json({
    users,
    ceilings: ceilingsPayload(),
    costRates: costRatesPayload(),
    worstCaseUsdPerUserPerDay: estimateVoiceWorstCaseUsd(
      VOICE_MAX_SESSIONS_PER_USER_PER_DAY
    ),
  });
}

function ceilingsPayload() {
  return {
    maxSessionDurationMs: VOICE_MAX_SESSION_DURATION_MS,
    maxSessionsPerUserPerDay: VOICE_MAX_SESSIONS_PER_USER_PER_DAY,
  };
}

function costRatesPayload() {
  return {
    audioInputUsdPerMin: VOICE_AUDIO_INPUT_USD_PER_MIN,
    audioOutputUsdPerMin: VOICE_AUDIO_OUTPUT_USD_PER_MIN,
    duplexUsdPerMin: VOICE_AUDIO_DUPLEX_USD_PER_MIN,
  };
}
