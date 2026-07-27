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
  return NextResponse.json({ ok: true, usage });
}
