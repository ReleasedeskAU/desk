/**
 * POST /api/copilot/voice/propose
 * Validate + stage a voice write (no mutation). Editor RBAC required.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/api";
import { zodErrorResponse } from "@/lib/api-errors";
import { proposeVoiceWrite } from "@/lib/voice/write-actions";

const bodySchema = z
  .object({
    actionType: z.string().trim().min(1).max(80),
    params: z.record(z.string(), z.unknown()),
    /** Client dispatch batch id — used to block same-turn confirm. */
    dispatchId: z.string().trim().min(1).max(80),
  })
  .strict();

export async function POST(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const result = await proposeVoiceWrite({
    user: user!,
    actionType: parsed.data.actionType,
    params: parsed.data.params,
    proposeDispatchId: parsed.data.dispatchId,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
