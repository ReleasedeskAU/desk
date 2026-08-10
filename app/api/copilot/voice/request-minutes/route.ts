/**
 * POST /api/copilot/voice/request-minutes
 * Signed-in user asks the voice super-admin for more daily minutes after hitting the cap.
 *
 * Auth: requireSession.
 * Side effect: sets VoiceUserPolicy.minutesApprovalRequestedAt (visible on /admin-voice).
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api";
import {
  checkVoiceUserAccess,
  requestVoiceMinutesApproval,
  VOICE_DEFAULT_DAILY_MINUTES,
} from "@/lib/voice/policy";
import { VOICE_SUPER_ADMIN_EMAIL } from "@/lib/voice/admin-gate-constants";

/**
 * Record a pending minutes-approval request for the current user.
 */
export async function POST() {
  const { user, error } = await requireSession();
  if (error) return error;

  try {
    const access = await checkVoiceUserAccess(user!.id);
    if (access.banned) {
      return NextResponse.json(
        { error: "Voice access is disabled for this account", code: "voice_banned" },
        { status: 403 }
      );
    }
    if (access.unlimitedUsage) {
      return NextResponse.json({
        ok: true,
        alreadyUnlimited: true,
        message: "Voice usage is already unlimited for this account",
      });
    }
    // Only accept requests at/over the cap (or when a prior request is still pending).
    if (access.allowed && !access.approvalRequested) {
      return NextResponse.json(
        {
          error:
            "You still have voice minutes left today. Request more only after the daily limit is reached.",
          code: "minutes_still_available",
          effectiveDailyMinutes: access.effectiveDailyMinutes,
          minutesUsed: Math.round(access.minutesUsed * 10) / 10,
        },
        { status: 400 }
      );
    }
    const policy = await requestVoiceMinutesApproval(user!.id, user!.email);
    return NextResponse.json({
      ok: true,
      approvalRequested: true,
      effectiveDailyMinutes:
        access.effectiveDailyMinutes ?? VOICE_DEFAULT_DAILY_MINUTES,
      minutesUsed: Math.round(access.minutesUsed * 10) / 10,
      minutesApprovalRequestedAt: policy.minutesApprovalRequestedAt?.toISOString() ?? null,
      message: `Request sent. An admin (${VOICE_SUPER_ADMIN_EMAIL}) can raise your limit or grant unlimited on Voice Admin.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    if (/VoiceUserPolicy|does not exist|P2021/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Voice policy storage is not available yet — ask your admin to apply the voice_user_policy migration",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Failed to request more voice minutes" },
      { status: 500 }
    );
  }
}
