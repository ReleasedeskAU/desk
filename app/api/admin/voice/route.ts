/**
 * GET /api/admin/voice
 * Voice super-admin: list today's usage merged with durable ban/minute policies.
 *
 * Auth: requireVoiceSuperAdmin (admin@releasedesk.com.au only).
 */
import { NextResponse } from "next/server";
import { requireVoiceSuperAdmin } from "@/lib/voice/admin-gate";
import {
  effectiveDailyMinutes,
  listVoiceUserPolicies,
  VOICE_DEFAULT_DAILY_MINUTES,
} from "@/lib/voice/policy";
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

type AdminVoiceUserRow = {
  clerkUserId: string;
  email: string | null;
  name: string | null;
  banned: boolean;
  unlimitedUsage: boolean;
  dailyMinutesLimit: number | null;
  /** Resolved cap for today (null = unlimited). */
  effectiveDailyMinutes: number | null;
  approvalRequested: boolean;
  minutesApprovalRequestedAt: string | null;
  sessionCount: number;
  durationMs: number;
  minutesUsed: number;
  dayKey: string | null;
  lastSessionAt: number | null;
  policyUpdatedAt: string | null;
};

function isVoicePolicyStorageError(message: string): boolean {
  return /VoiceUserPolicy|does not exist|P2021|P2022|column .* does not exist/i.test(
    message
  );
}

/**
 * Build the admin voice dashboard payload.
 */
export async function GET() {
  const { error } = await requireVoiceSuperAdmin();
  if (error) return error;

  try {
    let policies: Awaited<ReturnType<typeof listVoiceUserPolicies>> = [];
    let policyWarning: string | null = null;
    try {
      policies = await listVoiceUserPolicies();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Policy load failed";
      // Table/columns missing on this DATABASE_URL — page still loads with empty list.
      if (isVoicePolicyStorageError(message)) {
        policyWarning =
          "VoiceUserPolicy table is not available on this database — run prisma migrate deploy for voice_user_policy";
        console.error("admin.voice.list.policy", message);
      } else {
        throw err;
      }
    }

    const usage = listVoiceUsageToday();
    const byId = new Map<string, AdminVoiceUserRow>();

    for (const p of policies) {
      byId.set(p.clerkUserId, {
        clerkUserId: p.clerkUserId,
        email: p.email,
        name: null,
        banned: p.banned,
        unlimitedUsage: p.unlimitedUsage,
        dailyMinutesLimit: p.dailyMinutesLimit,
        effectiveDailyMinutes: effectiveDailyMinutes(p),
        approvalRequested: Boolean(p.minutesApprovalRequestedAt),
        minutesApprovalRequestedAt:
          p.minutesApprovalRequestedAt?.toISOString() ?? null,
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
          unlimitedUsage: false,
          dailyMinutesLimit: null,
          effectiveDailyMinutes: VOICE_DEFAULT_DAILY_MINUTES,
          approvalRequested: false,
          minutesApprovalRequestedAt: null,
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
      // Pending approvals first so the admin can act quickly.
      if (a.approvalRequested !== b.approvalRequested) {
        return a.approvalRequested ? -1 : 1;
      }
      if (a.banned !== b.banned) return a.banned ? -1 : 1;
      return b.minutesUsed - a.minutesUsed || b.sessionCount - a.sessionCount;
    });

    return NextResponse.json({
      users,
      defaultDailyMinutes: VOICE_DEFAULT_DAILY_MINUTES,
      warning: policyWarning,
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load voice admin";
    console.error("admin.voice.list", message);
    if (isVoicePolicyStorageError(message)) {
      return NextResponse.json(
        {
          error:
            "VoiceUserPolicy table is not available — run prisma migrate deploy (voice_user_policy)",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Failed to load voice admin data" },
      { status: 500 }
    );
  }
}
