/**
 * GET /api/admin/voice
 * Voice super-admin: list today's usage merged with durable ban/minute policies.
 *
 * Auth: requireVoiceSuperAdmin (admin@releasedesk.com.au only).
 */
import { NextResponse } from "next/server";
import { requireVoiceSuperAdmin } from "@/lib/voice/admin-gate";
import { listVoiceUserPolicies } from "@/lib/voice/policy";
import {
  listVoiceUsageToday,
  VOICE_AUDIO_DUPLEX_USD_PER_MIN,
  VOICE_AUDIO_INPUT_USD_PER_MIN,
  VOICE_AUDIO_OUTPUT_USD_PER_MIN,
  VOICE_MAX_SESSION_DURATION_MS,
  VOICE_MAX_SESSIONS_PER_USER_PER_DAY,
  estimateVoiceWorstCaseUsd,
} from "@/lib/voice/usage";
import { prisma } from "@/lib/prisma";

/**
 * Build the admin voice dashboard payload.
 */
export async function GET() {
  const { error } = await requireVoiceSuperAdmin();
  if (error) return error;

  const [policies, usage] = await Promise.all([
    listVoiceUserPolicies(),
    Promise.resolve(listVoiceUsageToday()),
  ]);

  const byId = new Map<
    string,
    {
      clerkUserId: string;
      email: string | null;
      name: string | null;
      banned: boolean;
      dailyMinutesLimit: number | null;
      sessionCount: number;
      durationMs: number;
      minutesUsed: number;
      dayKey: string | null;
      lastSessionAt: number | null;
      policyUpdatedAt: string | null;
    }
  >();

  for (const p of policies) {
    byId.set(p.clerkUserId, {
      clerkUserId: p.clerkUserId,
      email: p.email,
      name: null,
      banned: p.banned,
      dailyMinutesLimit: p.dailyMinutesLimit,
      sessionCount: 0,
      durationMs: 0,
      minutesUsed: 0,
      dayKey: null,
      lastSessionAt: null,
      policyUpdatedAt: p.updatedAt.toISOString(),
    });
  }

  for (const u of usage) {
    const existing = byId.get(u.userId);
    if (existing) {
      existing.sessionCount = u.sessionCount;
      existing.durationMs = u.durationMs;
      existing.minutesUsed = Math.round((u.durationMs / 60_000) * 10) / 10;
      existing.dayKey = u.dayKey;
      existing.lastSessionAt = u.lastSessionAt;
    } else {
      byId.set(u.userId, {
        clerkUserId: u.userId,
        email: null,
        name: null,
        banned: false,
        dailyMinutesLimit: null,
        sessionCount: u.sessionCount,
        durationMs: u.durationMs,
        minutesUsed: Math.round((u.durationMs / 60_000) * 10) / 10,
        dayKey: u.dayKey,
        lastSessionAt: u.lastSessionAt,
        policyUpdatedAt: null,
      });
    }
  }

  // Best-effort name/email fill from User directory by email.
  const emails = [...byId.values()]
    .map((r) => r.email)
    .filter((e): e is string => Boolean(e));
  if (emails.length) {
    try {
      const directory = await prisma.user.findMany({
        where: { email: { in: emails, mode: "insensitive" } },
        select: { email: true, name: true },
      });
      const byEmail = new Map(
        directory.map((d) => [d.email.toLowerCase(), d.name])
      );
      for (const row of byId.values()) {
        if (!row.email) continue;
        const name = byEmail.get(row.email.toLowerCase());
        if (name) row.name = name;
      }
    } catch {
      // Directory lookup is optional — do not fail the admin page.
    }
  }

  const users = [...byId.values()].sort((a, b) => {
    if (a.banned !== b.banned) return a.banned ? -1 : 1;
    return b.minutesUsed - a.minutesUsed || b.sessionCount - a.sessionCount;
  });

  return NextResponse.json({
    users,
    ceilings: {
      maxSessionDurationMs: VOICE_MAX_SESSION_DURATION_MS,
      maxSessionsPerUserPerDay: VOICE_MAX_SESSIONS_PER_USER_PER_DAY,
    },
    costRates: {
      audioInputUsdPerMin: VOICE_AUDIO_INPUT_USD_PER_MIN,
      audioOutputUsdPerMin: VOICE_AUDIO_OUTPUT_USD_PER_MIN,
      duplexUsdPerMin: VOICE_AUDIO_DUPLEX_USD_PER_MIN,
    },
    worstCaseUsdPerUserPerDay: estimateVoiceWorstCaseUsd(
      VOICE_MAX_SESSIONS_PER_USER_PER_DAY
    ),
  });
}
