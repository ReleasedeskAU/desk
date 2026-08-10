/**
 * Durable VoiceUserPolicy helpers — ban + daily minutes quota.
 * Enforced on session mint (and optionally heartbeat).
 */
import { prisma } from "@/lib/prisma";
import { getVoiceUserUsage } from "@/lib/voice/usage";

export type VoicePolicyRow = {
  clerkUserId: string;
  email: string | null;
  banned: boolean;
  dailyMinutesLimit: number | null;
  updatedAt: Date;
};

export type VoiceAccessCheck = {
  allowed: boolean;
  code?: "voice_banned" | "daily_minutes_ceiling";
  reason?: string;
  banned: boolean;
  dailyMinutesLimit: number | null;
  minutesUsed: number;
};

/**
 * Load a single policy by Clerk user id.
 * @param clerkUserId - Clerk user id.
 */
export async function getVoiceUserPolicy(
  clerkUserId: string
): Promise<VoicePolicyRow | null> {
  const row = await prisma.voiceUserPolicy.findUnique({
    where: { clerkUserId },
  });
  if (!row) return null;
  return {
    clerkUserId: row.clerkUserId,
    email: row.email,
    banned: row.banned,
    dailyMinutesLimit: row.dailyMinutesLimit,
    updatedAt: row.updatedAt,
  };
}

/**
 * List all stored voice policies.
 */
export async function listVoiceUserPolicies(): Promise<VoicePolicyRow[]> {
  const rows = await prisma.voiceUserPolicy.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((row) => ({
    clerkUserId: row.clerkUserId,
    email: row.email,
    banned: row.banned,
    dailyMinutesLimit: row.dailyMinutesLimit,
    updatedAt: row.updatedAt,
  }));
}

/**
 * Upsert ban / daily minutes / email for a Clerk user.
 * @param clerkUserId - Target Clerk user id.
 * @param patch - Fields to update (undefined = leave unchanged on existing row).
 */
export async function upsertVoiceUserPolicy(
  clerkUserId: string,
  patch: {
    email?: string | null;
    banned?: boolean;
    dailyMinutesLimit?: number | null;
  }
): Promise<VoicePolicyRow> {
  const row = await prisma.voiceUserPolicy.upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      email: patch.email ?? null,
      banned: patch.banned ?? false,
      dailyMinutesLimit:
        patch.dailyMinutesLimit === undefined ? null : patch.dailyMinutesLimit,
    },
    update: {
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.banned !== undefined ? { banned: patch.banned } : {}),
      ...(patch.dailyMinutesLimit !== undefined
        ? { dailyMinutesLimit: patch.dailyMinutesLimit }
        : {}),
    },
  });
  return {
    clerkUserId: row.clerkUserId,
    email: row.email,
    banned: row.banned,
    dailyMinutesLimit: row.dailyMinutesLimit,
    updatedAt: row.updatedAt,
  };
}

/**
 * Remember the user's email on the policy row (best-effort, non-blocking callers).
 * @param clerkUserId - Clerk user id.
 * @param email - Session email.
 */
export async function touchVoiceUserPolicyEmail(
  clerkUserId: string,
  email: string | null | undefined
): Promise<void> {
  const trimmed = (email ?? "").trim();
  if (!trimmed) return;
  await prisma.voiceUserPolicy.upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      email: trimmed,
      banned: false,
      dailyMinutesLimit: null,
    },
    update: { email: trimmed },
  });
}

/**
 * Pure access decision from policy + minutes used (testable without Prisma).
 * @param policy - Stored policy or null.
 * @param minutesUsed - Connected minutes today from heartbeats.
 */
export function evaluateVoiceAccess(
  policy: Pick<VoicePolicyRow, "banned" | "dailyMinutesLimit"> | null,
  minutesUsed: number
): VoiceAccessCheck {
  const banned = policy?.banned ?? false;
  const dailyMinutesLimit = policy?.dailyMinutesLimit ?? null;

  if (banned) {
    return {
      allowed: false,
      code: "voice_banned",
      reason: "Voice access is disabled for this account",
      banned: true,
      dailyMinutesLimit,
      minutesUsed,
    };
  }

  if (
    dailyMinutesLimit != null &&
    dailyMinutesLimit >= 0 &&
    minutesUsed >= dailyMinutesLimit
  ) {
    return {
      allowed: false,
      code: "daily_minutes_ceiling",
      reason: `Daily voice minutes limit reached (${dailyMinutesLimit} min/day)`,
      banned: false,
      dailyMinutesLimit,
      minutesUsed,
    };
  }

  return {
    allowed: true,
    banned: false,
    dailyMinutesLimit,
    minutesUsed,
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
