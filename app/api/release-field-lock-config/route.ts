/**
 * GET/PUT /api/release-field-lock-config
 *
 * Authenticated, Clerk-user-scoped Release field-lock matrix.
 * Identity always from session; bodies cannot target another user.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/api";
import {
  RELEASE_FIELD_LOCK_CATALOG,
  RELEASE_FIELD_LOCK_GAP_ROWS,
} from "@/lib/release-field-lock-catalog";
import {
  loadReleaseFieldLockConfig,
  saveReleaseFieldLockConfig,
} from "@/lib/release-field-lock-config-db";

const putSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            fieldKey: z.string().trim().min(1).max(80),
            statusRules: z.record(
              z.enum(["editable", "locked", "editable_with_side_effect"])
            ),
          })
          .strict()
      )
      .min(1)
      .max(80),
  })
  .strict();

function publicError(error: unknown): string {
  return process.env.NODE_ENV === "production"
    ? "Release field-lock configuration is temporarily unavailable"
    : error instanceof Error
      ? error.message.slice(0, 180)
      : "Unknown error";
}

/** Return matrix + live statuses; seeds defaults on first access. */
export async function GET() {
  const { user, error } = await requireSession();
  if (error) return error;

  try {
    const loaded = await loadReleaseFieldLockConfig(user!.id);
    return NextResponse.json({
      rows: loaded.rows,
      orphanStatusKeys: loaded.orphanStatusKeys,
      statuses: loaded.lifecycleConfig.statuses
        .filter((s) => s.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({ key: s.key, label: s.label, sortOrder: s.sortOrder })),
      catalog: RELEASE_FIELD_LOCK_CATALOG.map((e) => ({
        fieldKey: e.fieldKey,
        label: e.label,
        category: e.category,
        lockRuleRef: e.lockRuleRef,
        isConfigurable: e.isConfigurable,
        infoOnly: Boolean(e.infoOnly),
        unavailable: false,
      })),
      gapRows: RELEASE_FIELD_LOCK_GAP_ROWS.map((e) => ({
        fieldKey: e.fieldKey,
        label: e.label,
        category: e.category,
        lockRuleRef: e.lockRuleRef,
        isConfigurable: false,
        infoOnly: false,
        unavailable: true,
      })),
    });
  } catch (loadError) {
    console.warn("[release-field-lock-config] GET failed", {
      name: loadError instanceof Error ? loadError.name : "UnknownError",
    });
    return NextResponse.json(
      { error: publicError(loadError) },
      { status: 503 }
    );
  }
}

/** Update configurable matrix cells. */
export async function PUT(req: Request) {
  const { user, error } = await requireSession();
  if (error) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid field-lock payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const loaded = await saveReleaseFieldLockConfig(user!.id, parsed.data.rows);
    return NextResponse.json({
      rows: loaded.rows,
      orphanStatusKeys: loaded.orphanStatusKeys,
      statuses: loaded.lifecycleConfig.statuses
        .filter((s) => s.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({ key: s.key, label: s.label, sortOrder: s.sortOrder })),
    });
  } catch (saveError) {
    const message =
      saveError instanceof Error ? saveError.message : "Save failed";
    const clientError =
      /not configurable|Unknown|Invalid|Unknown status/i.test(message);
    if (clientError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.warn("[release-field-lock-config] PUT failed", {
      name: saveError instanceof Error ? saveError.name : "UnknownError",
    });
    return NextResponse.json({ error: publicError(saveError) }, { status: 503 });
  }
}
