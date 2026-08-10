/**
 * POST /api/copilot/voice/manager
 * Read-only release-manager voice ops: bundle, attention, calendar, compare.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/api";
import { zodErrorResponse } from "@/lib/api-errors";
import {
  buildAttentionBrief,
  buildCalendarWindow,
  buildReleaseBundle,
  compareReleaseBundles,
} from "@/lib/voice/manager-reads";

const bodySchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("release_bundle"),
      releaseCode: z.string().trim().min(1).max(64),
    })
    .strict(),
  z
    .object({
      op: z.literal("attention_brief"),
      period: z.enum(["month", "quarter", "year"]).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("calendar_window"),
      from: z.string().trim().min(8).max(40),
      to: z.string().trim().min(8).max(40),
      field: z.enum(["releaseDate", "cabDate"]).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("compare_releases"),
      codes: z.array(z.string().trim().min(1).max(64)).min(2).max(3),
    })
    .strict(),
]);

export async function POST(req: Request) {
  const { user, error } = await requireRole("readonly");
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
    switch (parsed.data.op) {
      case "release_bundle": {
        const bundle = await buildReleaseBundle(parsed.data.releaseCode);
        if (!bundle) {
          return NextResponse.json({
            ok: false,
            reason: `Release not found: ${parsed.data.releaseCode}`,
          });
        }
        return NextResponse.json({ ok: true, op: "release_bundle", bundle });
      }
      case "attention_brief": {
        const brief = await buildAttentionBrief(
          parsed.data.period ?? "month",
          user?.id
        );
        return NextResponse.json({ ok: true, op: "attention_brief", brief });
      }
      case "calendar_window": {
        const window = await buildCalendarWindow({
          from: parsed.data.from,
          to: parsed.data.to,
          field: parsed.data.field,
        });
        return NextResponse.json({ ok: true, op: "calendar_window", window });
      }
      case "compare_releases": {
        const comparison = await compareReleaseBundles(parsed.data.codes);
        return NextResponse.json({ ok: true, op: "compare_releases", comparison });
      }
      default:
        return NextResponse.json({ ok: false, reason: "Unknown op" }, { status: 400 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Manager read failed";
    return NextResponse.json({ ok: false, reason: message }, { status: 400 });
  }
}
