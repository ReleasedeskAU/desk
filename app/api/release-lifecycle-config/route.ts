/**
 * GET/PUT /api/release-lifecycle-config
 *
 * Authenticated, Clerk-user-scoped lifecycle graph. Identity is always taken
 * from the session; request bodies cannot choose another user's config.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/api";
import {
  MAX_RELEASE_LIFECYCLE_STATUSES,
  MAX_RELEASE_LIFECYCLE_TRANSITIONS,
  RELEASE_LIFECYCLE_ENFORCEMENTS,
  RELEASE_LIFECYCLE_GATE_ENFORCEMENTS,
  RELEASE_LIFECYCLE_STATUS_KINDS,
  validateReleaseLifecycleConfig,
  type ReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config";
import {
  RELEASE_LIFECYCLE_GATE_TYPES,
} from "@/lib/release-lifecycle-gates";
import {
  loadReleaseLifecycleConfig,
  saveReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config-db";

const statusSchema = z
  .object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/),
    label: z.string().trim().min(1).max(80),
    sortOrder: z.coerce.number().int().min(0).max(10_000),
    terminal: z.boolean(),
    kind: z.enum(RELEASE_LIFECYCLE_STATUS_KINDS),
    isSystem: z.boolean(),
    enabled: z.boolean(),
  })
  .strict();

const gateSchema = z
  .object({
    gateType: z.enum(RELEASE_LIFECYCLE_GATE_TYPES),
    enabled: z.boolean(),
    enforcement: z.enum(RELEASE_LIFECYCLE_GATE_ENFORCEMENTS),
    params: z.record(z.unknown()).optional(),
    sortOrder: z.coerce.number().int().min(0).max(10_000),
  })
  .strict();

const transitionSchema = z
  .object({
    fromKey: z.string().trim().min(1).max(40),
    toKey: z.string().trim().min(1).max(40).nullable(),
    isPreviousStatus: z.boolean(),
    enabled: z.boolean(),
    enforcement: z.enum(RELEASE_LIFECYCLE_ENFORCEMENTS),
    isSystem: z.boolean(),
    sortOrder: z.coerce.number().int().min(0).max(10_000),
    gates: z.array(gateSchema).max(30),
  })
  .strict();

const putSchema = z
  .object({
    statuses: z
      .array(statusSchema)
      .min(1)
      .max(MAX_RELEASE_LIFECYCLE_STATUSES),
    transitions: z
      .array(transitionSchema)
      .max(MAX_RELEASE_LIFECYCLE_TRANSITIONS),
  })
  .strict();

function publicError(error: unknown): string {
  return process.env.NODE_ENV === "production"
    ? "Release lifecycle configuration is temporarily unavailable"
    : error instanceof Error
      ? error.message.slice(0, 180)
      : "Unknown error";
}

/** Return the caller's lifecycle graph, seeding defaults on first access. */
export async function GET() {
  const { user, error } = await requireSession();
  if (error) return error;

  try {
    const loaded = await loadReleaseLifecycleConfig(user!.id);
    // Surface fallback loudly to the client — never silently serve Enterprise
    // Default when the caller's stored graph failed validation.
    if (loaded.enterpriseDefaultFallback) {
      return NextResponse.json({
        config: loaded.config,
        warning: {
          code: "ENTERPRISE_DEFAULT_FALLBACK",
          message:
            "Stored lifecycle config was invalid and was replaced with the Enterprise Default for this response. Fix and re-save the configuration.",
          reason: loaded.enterpriseDefaultFallback.reason,
        },
      });
    }
    return NextResponse.json({ config: loaded.config });
  } catch (loadError) {
    console.error("[release-lifecycle-config] load failed", {
      name: loadError instanceof Error ? loadError.name : "UnknownError",
    });
    return NextResponse.json(
      { error: publicError(loadError) },
      { status: 503 }
    );
  }
}

/** Validate and replace the caller's complete lifecycle graph. */
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
      { error: "Invalid lifecycle config", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Validate before persistence; reads may normalize corrupted stored rows,
  // but writes must never silently replace invalid user input with defaults.
  const config = parsed.data as ReleaseLifecycleConfig;
  const validationError = validateReleaseLifecycleConfig(config);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const saved = await saveReleaseLifecycleConfig(user!.id, config);
    return NextResponse.json({ config: saved });
  } catch (saveError) {
    console.error("[release-lifecycle-config] save failed", {
      name: saveError instanceof Error ? saveError.name : "UnknownError",
    });
    return NextResponse.json(
      { error: publicError(saveError) },
      { status: 500 }
    );
  }
}
