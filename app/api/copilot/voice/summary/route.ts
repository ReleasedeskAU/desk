/**
 * POST /api/copilot/voice/summary
 * Read-only spoken summary for voice get_summary.
 * Reuses Conversation Agent DB access via lib/conversation-entity-summary
 * (lookupReleaseByCode for releases; same Prisma patterns for other types).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/api";
import { jsonError, zodErrorResponse } from "@/lib/api-errors";
import { SEARCH_ENTITY_TYPES } from "@/lib/search-entity-types";
import { lookupEntitySpokenSummary } from "@/lib/conversation-entity-summary";

const bodySchema = z
  .object({
    entityType: z.enum(
      SEARCH_ENTITY_TYPES as unknown as [string, ...string[]]
    ) as z.ZodType<(typeof SEARCH_ENTITY_TYPES)[number]>,
    entityId: z.string().trim().min(1).max(200),
  })
  .strict();

export async function POST(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  try {
    const started = Date.now();
    const result = await lookupEntitySpokenSummary(
      parsed.data.entityType,
      parsed.data.entityId
    );
    const elapsedMs = Date.now() - started;

    if (result.status === "invalid") {
      return NextResponse.json(
        { ok: false, status: result.status, reason: result.reason, elapsedMs },
        { status: 400 }
      );
    }
    if (result.status === "unsupported") {
      return NextResponse.json({
        ok: false,
        status: result.status,
        entityType: result.entityType,
        entityId: result.entityId,
        reason: result.reason,
        elapsedMs,
      });
    }
    if (result.status === "not_found") {
      return NextResponse.json({
        ok: false,
        status: result.status,
        entityType: result.entityType,
        entityId: result.entityId,
        reason: result.reason,
        elapsedMs,
      });
    }

    return NextResponse.json({
      ok: true,
      status: result.status,
      entityType: result.entityType,
      entityId: result.entityId,
      summary: result.summary,
      elapsedMs,
    });
  } catch (err) {
    return jsonError(err, {
      publicMessage: "Failed to load entity summary",
      status: 500,
      logLabel: "voice.summary",
    });
  }
}
