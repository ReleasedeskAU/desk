/**
 * Durable VoiceUserPolicy helpers — ban + daily minutes quota.
 * Default: every user gets 10 minutes/day unless admin grants more or unlimited.
 * After the cap, users can request admin approval for more time.
 */
import { prisma } from "@/lib/prisma";
import { getVoiceUserUsage } from "@/lib/voice/usage";
import { VOICE_SUPER_ADMIN_EMAIL } from "@/lib/voice/admin-gate-constants";
import { VOICE_DEFAULT_DAILY_MINUTES } from "@/lib/voice/policy-constants";

export { VOICE_DEFAULT_DAILY_MINUTES } from "@/lib/voice/policy-constants";

export type VoicePolicyRow = {
  clerkUserId: string;
  email: string | null;
  banned: boolean;
  unlimitedUsage: boolean;
  dailyMinutesLimit: number | null;
  minutesApprovalRequestedAt: Date | null;
  updatedAt: Date;
};

export type VoiceAccessCheck = {
  allowed: boolean;
  code?: "voice_banned" | "daily_minutes_ceiling";
  reason?: string;
  banned: boolean;
  unlimitedUsage: boolean;
  /** Effective cap for today (null only when unlimited). */
  effectiveDailyMinutes: number | null;
  dailyMinutesLimit: number | null;
  minutesUsed: number;
  approvalRequested: boolean;
};

function mapPolicy(row: {
  clerkUserId: string;
  email: string | null;
  banned: boolean;
  unlimitedUsage: boolean;
  dailyMinutesLimit: number | null;
  minutesApprovalRequestedAt: Date | null;
  updatedAt: Date;
}): VoicePolicyRow {
  return {
    clerkUserId: row.clerkUserId,
    email: row.email,
    banned: row.banned,
    unlimitedUsage: row.unlimitedUsage,
    dailyMinutesLimit: row.dailyMinutesLimit,
    minutesApprovalRequestedAt: row.minutesApprovalRequestedAt,
    updatedAt: row.updatedAt,
  };
}

/** Minimal policy fields needed to resolve the daily minutes cap. */
export type VoiceMinutesPolicyInput = {
  unlimitedUsage?: boolean;
  dailyMinutesLimit?: number | null;
} | null;

/**
 * Effective daily minutes cap for a policy.
 * @returns null when unlimited; otherwise a non-negative minute count.
 */
export function effectiveDailyMinutes(
  policy: VoiceMinutesPolicyInput
): number | null {
  if (policy?.unlimitedUsage) return null;
  if (
    policy?.dailyMinutesLimit != null &&
    Number.isFinite(policy.dailyMinutesLimit) &&
    policy.dailyMinutesLimit >= 0
  ) {
    return Math.floor(policy.dailyMinutesLimit);
  }
  return VOICE_DEFAULT_DAILY_MINUTES;
}

type VoiceUserPolicyRecord = Parameters<typeof mapPolicy>[0];

type VoiceUserPolicyDelegate = {
  findUnique: (args: {
    where: { clerkUserId: string };
  }) => Promise<VoiceUserPolicyRecord | null>;
  findMany: (args: {
    orderBy: { updatedAt: "desc" };
  }) => Promise<VoiceUserPolicyRecord[]>;
  upsert: (args: {
    where: { clerkUserId: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }) => Promise<VoiceUserPolicyRecord>;
};

/**
 * Prisma delegate for VoiceUserPolicy — throws a clear error if the generated
 * client is stale (vendor/ regenerated but node_modules/@releasedesk/database not synced).
 */
function voiceUserPolicyDelegate(): VoiceUserPolicyDelegate {
  const delegate = (prisma as unknown as { voiceUserPolicy?: VoiceUserPolicyDelegate })
    .voiceUserPolicy;
  if (!delegate?.findMany || !delegate?.findUnique || !delegate?.upsert) {
    throw new Error(
      "VoiceUserPolicy model missing from Prisma client — regenerate @releasedesk/database (clean-and-generate-prisma)"
    );
  }
  return delegate;
}

/**
 * Load a single policy by Clerk user id.
 * @param clerkUserId - Clerk user id.
 */
export async function getVoiceUserPolicy(
  clerkUserId: string
): Promise<VoicePolicyRow | null> {
  const row = await voiceUserPolicyDelegate().findUnique({
    where: { clerkUserId },
  });
  if (!row) return null;
  return mapPolicy(row);
}

/**
 * List all stored voice policies.
 */
export async function listVoiceUserPolicies(): Promise<VoicePolicyRow[]> {
  const rows = await voiceUserPolicyDelegate().findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(mapPolicy);
}

/**
 * Upsert ban / minutes / unlimited / email / clear approval for a Clerk user.
 * @param clerkUserId - Target Clerk user id.
 * @param patch - Fields to update (undefined = leave unchanged on existing row).
 */
export async function upsertVoiceUserPolicy(
  clerkUserId: string,
  patch: {
    email?: string | null;
    banned?: boolean;
    unlimitedUsage?: boolean;
    dailyMinutesLimit?: number | null;
    /** When true, clears a pending minutes-approval request. */
    clearMinutesApproval?: boolean;
  }
): Promise<VoicePolicyRow> {
  const row = await voiceUserPolicyDelegate().upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      email: patch.email ?? null,
      banned: patch.banned ?? false,
      unlimitedUsage: patch.unlimitedUsage ?? false,
      dailyMinutesLimit:
        patch.dailyMinutesLimit === undefined ? null : patch.dailyMinutesLimit,
      minutesApprovalRequestedAt: null,
    },
    update: {
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.banned !== undefined ? { banned: patch.banned } : {}),
      ...(patch.unlimitedUsage !== undefined
        ? { unlimitedUsage: patch.unlimitedUsage }
        : {}),
      ...(patch.dailyMinutesLimit !== undefined
        ? { dailyMinutesLimit: patch.dailyMinutesLimit }
        : {}),
      ...(patch.clearMinutesApproval
        ? { minutesApprovalRequestedAt: null }
        : {}),
    },
  });
  return mapPolicy(row);
}

/**
 * Remember the user's email on the policy row (best-effort).
 * @param clerkUserId - Clerk user id.
 * @param email - Session email.
 */
export async function touchVoiceUserPolicyEmail(
  clerkUserId: string,
  email: string | null | undefined
): Promise<void> {
  const trimmed = (email ?? "").trim();
  if (!trimmed) return;
  await voiceUserPolicyDelegate().upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      email: trimmed,
      banned: false,
      unlimitedUsage: false,
      dailyMinutesLimit: null,
      minutesApprovalRequestedAt: null,
    },
    update: { email: trimmed },
  });
}

/**
 * User asks admin for more voice minutes after hitting the default/custom cap.
 * @param clerkUserId - Clerk user id.
 * @param email - Session email (stored for admin list).
 */
export async function requestVoiceMinutesApproval(
  clerkUserId: string,
  email: string | null | undefined
): Promise<VoicePolicyRow> {
  const trimmed = (email ?? "").trim() || null;
  const row = await voiceUserPolicyDelegate().upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      email: trimmed,
      banned: false,
      unlimitedUsage: false,
      dailyMinutesLimit: null,
      minutesApprovalRequestedAt: new Date(),
    },
    update: {
      ...(trimmed ? { email: trimmed } : {}),
      minutesApprovalRequestedAt: new Date(),
    },
  });
  return mapPolicy(row);
}

/**
 * Pure access decision from policy + minutes used (testable without Prisma).
 * @param policy - Stored policy or null.
 * @param minutesUsed - Connected minutes today from heartbeats.
 */
export function evaluateVoiceAccess(
  policy: {
    banned?: boolean;
    unlimitedUsage?: boolean;
    dailyMinutesLimit?: number | null;
    minutesApprovalRequestedAt?: Date | null;
  } | null,
  minutesUsed: number
): VoiceAccessCheck {
  const banned = policy?.banned ?? false;
  const unlimitedUsage = policy?.unlimitedUsage ?? false;
  const dailyMinutesLimit = policy?.dailyMinutesLimit ?? null;
  const effective = effectiveDailyMinutes({
    unlimitedUsage,
    dailyMinutesLimit,
  });
  const approvalRequested = Boolean(policy?.minutesApprovalRequestedAt);

  if (banned) {
    return {
      allowed: false,
      code: "voice_banned",
      reason: "Voice access is disabled for this account",
      banned: true,
      unlimitedUsage,
      effectiveDailyMinutes: effective,
      dailyMinutesLimit,
      minutesUsed,
      approvalRequested,
    };
  }

  if (unlimitedUsage || effective == null) {
    return {
      allowed: true,
      banned: false,
      unlimitedUsage: true,
      effectiveDailyMinutes: null,
      dailyMinutesLimit,
      minutesUsed,
      approvalRequested,
    };
  }

  if (minutesUsed >= effective) {
    return {
      allowed: false,
      code: "daily_minutes_ceiling",
      reason: approvalRequested
        ? `Daily voice limit reached (${effective} min). Your request for more time is waiting on admin approval (${VOICE_SUPER_ADMIN_EMAIL}).`
        : `Daily voice limit reached (${effective} min). Ask your admin (${VOICE_SUPER_ADMIN_EMAIL}) to approve more minutes, or open Voice Admin if you are the admin.`,
      banned: false,
      unlimitedUsage: false,
      effectiveDailyMinutes: effective,
      dailyMinutesLimit,
      minutesUsed,
      approvalRequested,
    };
  }

  return {
    allowed: true,
    banned: false,
    unlimitedUsage: false,
    effectiveDailyMinutes: effective,
    dailyMinutesLimit,
    minutesUsed,
    approvalRequested,
  };
}

/**
 * Whether the user may start/continue voice given ban + daily minutes.
 * @param clerkUserId - Clerk user id.
 */
export async function checkVoiceUserAccess(
  clerkUserId: string
): Promise<VoiceAccessCheck> {
  const policy = await getVoiceUserPolicy(clerkUserId);
  const usage = getVoiceUserUsage(clerkUserId);
  const minutesUsed = usage.durationMs / 60_000;
  return evaluateVoiceAccess(policy, minutesUsed);
}
