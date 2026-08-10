/**
 * PATCH /api/admin/voice/[clerkUserId]
 * Voice super-admin: set ban, daily minutes, unlimited usage, or clear approval.
 *
 * Auth: requireVoiceSuperAdmin.
 * Body (Zod strict): {
 *   banned?, dailyMinutesLimit?, unlimitedUsage?, clearMinutesApproval?, email?
 * }
 * Semantics: null dailyMinutesLimit + unlimitedUsage=false → default 10 min/day.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVoiceSuperAdmin } from "@/lib/voice/admin-gate";
import { upsertVoiceUserPolicy } from "@/lib/voice/policy";
import { zodErrorResponse } from "@/lib/api-errors";

const patchSchema = z
  .object({
    banned: z.boolean().optional(),
    /** Custom daily minutes. Null = use default 10 (unless unlimitedUsage). */
    dailyMinutesLimit: z
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .nullable()
      .optional(),
    unlimitedUsage: z.boolean().optional(),
    /** Clear a pending “need more minutes” request after approving. */
    clearMinutesApproval: z.boolean().optional(),
    email: z.string().trim().email().max(320).optional(),
  })
  .strict();

type RouteContext = { params: Promise<{ clerkUserId: string }> };

/**
 * Update voice policy for a Clerk user id.
 * @param req - JSON body.
 * @param context - Dynamic clerkUserId segment.
 */
export async function PATCH(req: Request, context: RouteContext) {
  const { error } = await requireVoiceSuperAdmin();
  if (error) return error;

  const { clerkUserId: rawId } = await context.params;
  const clerkUserId = (rawId ?? "").trim();
  if (!clerkUserId || clerkUserId.length > 128) {
    return NextResponse.json({ error: "Invalid clerkUserId" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const {
    banned,
    dailyMinutesLimit,
    unlimitedUsage,
    clearMinutesApproval,
    email,
  } = parsed.data;

  if (
    banned === undefined &&
    dailyMinutesLimit === undefined &&
    unlimitedUsage === undefined &&
    clearMinutesApproval === undefined &&
    email === undefined
  ) {
    return NextResponse.json(
      {
        error:
          "Provide banned, dailyMinutesLimit, unlimitedUsage, clearMinutesApproval, and/or email",
      },
      { status: 400 }
    );
  }

  // Only clear a pending request when admin grants more access (not on reset-to-default).
  const shouldClearApproval =
    clearMinutesApproval === true ||
    unlimitedUsage === true ||
    (typeof dailyMinutesLimit === "number" &&
      Number.isFinite(dailyMinutesLimit));

  try {
    const policy = await upsertVoiceUserPolicy(clerkUserId, {
      ...(banned !== undefined ? { banned } : {}),
      ...(dailyMinutesLimit !== undefined ? { dailyMinutesLimit } : {}),
      ...(unlimitedUsage !== undefined ? { unlimitedUsage } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(shouldClearApproval ? { clearMinutesApproval: true } : {}),
      // Custom minutes and unlimited are mutually exclusive controls.
      ...(dailyMinutesLimit != null && unlimitedUsage === undefined
        ? { unlimitedUsage: false }
        : {}),
      ...(unlimitedUsage === true && dailyMinutesLimit === undefined
        ? { dailyMinutesLimit: null }
        : {}),
    });
    return NextResponse.json({ ok: true, policy });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    // Table missing on a lagging DB — fail closed with a clear admin message.
    if (/VoiceUserPolicy|does not exist|P2021/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "VoiceUserPolicy table is not available — run the voice_user_policy migration",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update voice policy" },
      { status: 500 }
    );
  }
}
