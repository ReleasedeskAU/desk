/**
 * POST /api/copilot/voice/confirm
 * Execute (or discard) a staged voice write via the real entity PATCH routes.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, requireSession } from "@/lib/auth/api";
import { zodErrorResponse } from "@/lib/api-errors";
import { confirmVoiceWrite } from "@/lib/voice/write-actions";

const bodySchema = z
  .object({
    actionId: z.string().trim().min(1).max(80),
    /** false = verbal cancel — discard proposal, no PATCH. Default true. */
    accept: z.boolean().optional(),
    dispatchId: z.string().trim().min(1).max(80),
  })
  .strict();

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const accept = parsed.data.accept !== false;

  // Discard only needs a session; execute re-checks editor at confirm time.
  const auth = accept ? await requireRole("editor") : await requireSession();
  if (auth.error) return auth.error;

  const origin = new URL(req.url).origin;
  const cookieHeader = req.headers.get("cookie") ?? "";

  const result = await confirmVoiceWrite({
    user: auth.user!,
    actionId: parsed.data.actionId,
    accept,
    confirmDispatchId: parsed.data.dispatchId,
    deps: { origin, cookieHeader },
  });

  const status = result.ok ? 200 : result.reason.includes("Forbidden") ? 403 : 400;
  return NextResponse.json(result, { status });
}
