/**
 * POST /api/copilot/voice/heartbeat
 * Client reports connected duration while a Live session is open (usage / cost monitoring).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/api";
import { zodErrorResponse } from "@/lib/api-errors";
import {
  recordVoiceSessionHeartbeat,
  VOICE_USAGE_HEARTBEAT_MS,
} from "@/lib/voice/usage";
import { checkVoiceUserAccess } from "@/lib/voice/policy";

const bodySchema = z
  .object({
    deltaMs: z.number().finite().nonnegative().max(VOICE_USAGE_HEARTBEAT_MS * 3),
  })
  .strict();

/**
 * Accumulate rough session duration for the signed-in user.
 * @param req - JSON { deltaMs }.
 */
export async function POST(req: Request) {
  const { user, error } = await requireSession();
  if (error) return error;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const usage = recordVoiceSessionHeartbeat(user!.id, parsed.data.deltaMs);

  let forceDisconnect = false;
  let accessCode: string | undefined;
  let accessReason: string | undefined;
  let canRequestApproval = false;
  let approvalRequested = false;
  try {
    const access = await checkVoiceUserAccess(user!.id);
    if (!access.allowed) {
      forceDisconnect = true;
      accessCode = access.code;
      accessReason = access.reason;
      canRequestApproval = access.code === "daily_minutes_ceiling";
      approvalRequested = access.approvalRequested;
    }
  } catch {
    // Pre-migration / DB blip — keep heartbeat telemetry flowing.
  }

  return NextResponse.json({
    ok: true,
    usage,
    forceDisconnect,
    code: accessCode,
    reason: accessReason,
    canRequestApproval,
    approvalRequested,
  });
}
