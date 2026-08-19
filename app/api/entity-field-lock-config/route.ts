/**
 * GET/PUT /api/entity-field-lock-config?entityType=blocker
 *
 * Authenticated, Clerk-user-scoped entity field-lock matrix.
 * Identity always from session; bodies cannot target another user.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/api";
import { BLOCKER_FIELD_LOCK_CATALOG, BLOCKER_FIELD_LOCK_GAP_ROWS } from "@/lib/blocker-field-lock-catalog";
import {
  isEntityFieldLockType,
  type EntityFieldLockCatalogEntry,
  type EntityFieldLockType,
} from "@/lib/entity-field-lock";
import {
  loadEntityFieldLockConfig,
  saveEntityFieldLockConfig,
} from "@/lib/entity-field-lock-config-db";

const putSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            fieldKey: z.string().trim().min(1).max(80),
            // Blockers have no VR-21 side-effect state — reject it at the boundary.
            statusRules: z.record(z.enum(["editable", "locked"])),
          })
          .strict()
      )
      .min(1)
      .max(80),
  })
  .strict();

function publicError(error: unknown): string {
  return process.env.NODE_ENV === "production"
    ? "Field-lock configuration is temporarily unavailable"
    : error instanceof Error
      ? error.message.slice(0, 180)
      : "Unknown error";
}

function parseEntityType(req: Request): EntityFieldLockType | NextResponse {
  const raw = new URL(req.url).searchParams.get("entityType");
  if (!isEntityFieldLockType(raw)) {
    return NextResponse.json(
      { error: "Unknown entity type for field locks." },
      { status: 400 }
    );
  }
  return raw;
}

function catalogFor(
  entityType: EntityFieldLockType
): {
  catalog: readonly EntityFieldLockCatalogEntry[];
  gapRows: readonly EntityFieldLockCatalogEntry[];
} {
  if (entityType === "blocker") {
    return {
      catalog: BLOCKER_FIELD_LOCK_CATALOG,
      gapRows: BLOCKER_FIELD_LOCK_GAP_ROWS,
    };
  }
  return { catalog: [], gapRows: [] };
}

function mapCatalogEntry(e: EntityFieldLockCatalogEntry, unavailable: boolean) {
  return {
    fieldKey: e.fieldKey,
    label: e.label,
    category: e.category,
    lockRuleRef: e.lockRuleRef,
    isConfigurable: unavailable ? false : e.isConfigurable,
    infoOnly: Boolean(e.infoOnly),
    unavailable,
  };
}

/** Return matrix + live statuses; seeds defaults on first access. */
export async function GET(req: Request) {
  const { user, error } = await requireSession();
  if (error) return error;

  const entityType = parseEntityType(req);
  if (entityType instanceof NextResponse) return entityType;

  try {
    const loaded = await loadEntityFieldLockConfig(user!.id, entityType);
    const { catalog, gapRows } = catalogFor(entityType);
    const byKey = new Map(catalog.map((e) => [e.fieldKey, e]));
    return NextResponse.json({
      entityType,
      rows: loaded.rows.map((row) => {
        const meta = byKey.get(row.fieldKey);
        return {
          ...row,
          label: meta?.label ?? row.fieldKey,
          infoOnly: Boolean(meta?.infoOnly),
          unavailable: false,
        };
      }),
      orphanStatusKeys: loaded.orphanStatusKeys,
      statuses: loaded.statuses
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({ key: s.key, label: s.label, sortOrder: s.sortOrder })),
      catalog: catalog
        .filter((e) => !e.unavailable)
        .map((e) => mapCatalogEntry(e, false)),
      gapRows: gapRows.map((e) => mapCatalogEntry(e, true)),
    });
  } catch (loadError) {
    console.warn("[entity-field-lock-config] GET failed", {
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

  const entityType = parseEntityType(req);
  if (entityType instanceof NextResponse) return entityType;

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
    const loaded = await saveEntityFieldLockConfig(
      user!.id,
      entityType,
      parsed.data.rows
    );
    return NextResponse.json({
      entityType,
      rows: loaded.rows,
      orphanStatusKeys: loaded.orphanStatusKeys,
      statuses: loaded.statuses
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({ key: s.key, label: s.label, sortOrder: s.sortOrder })),
    });
  } catch (saveError) {
    const message =
      saveError instanceof Error ? saveError.message : "Save failed";
    const clientError =
      /not configurable|Unknown|Invalid|always locked|Unknown status/i.test(
        message
      );
    if (clientError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.warn("[entity-field-lock-config] PUT failed", {
      name: saveError instanceof Error ? saveError.name : "UnknownError",
    });
    return NextResponse.json({ error: publicError(saveError) }, { status: 503 });
  }
}
