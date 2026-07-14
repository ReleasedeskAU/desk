import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

const DEFAULT_COLOR_THEME = "sky";
const appearancePreferenceSchema = z
  .object({
    colorTheme: z.enum(["sky", "indigo", "emerald", "violet", "graphite", "amber"]),
  })
  .strict();

type AppearancePreferenceRow = {
  colorTheme: string;
};

function logPersistenceError(operation: "GET" | "PUT", error: unknown): void {
  const errorMetadata =
    error && typeof error === "object"
      ? {
          name: "name" in error ? String(error.name) : "UnknownError",
          code: "code" in error ? String(error.code) : undefined,
        }
      : { name: "UnknownError", code: undefined };

  // Request data and identity are deliberately excluded because Clerk IDs are sensitive identifiers.
  console.error("[appearance-preferences] persistence failed", {
    operation,
    ...errorMetadata,
  });
}

/**
 * Returns the authenticated user's persisted color theme.
 * @returns A JSON color theme; defaults to sky when no preference exists.
 * @throws No errors to callers; authentication and persistence failures become generic HTTP responses.
 */
export async function GET() {
  const { user, error } = await requireSession();
  if (error) return error;

  try {
    const rows = await prisma.$queryRaw<AppearancePreferenceRow[]>`
      SELECT "colorTheme"
      FROM "UserAppearancePreference"
      WHERE "clerkUserId" = ${user!.id}
      LIMIT 1
    `;

    return NextResponse.json({
      colorTheme: rows[0]?.colorTheme ?? DEFAULT_COLOR_THEME,
    });
  } catch (persistenceError) {
    logPersistenceError("GET", persistenceError);
    return NextResponse.json(
      { error: "Failed to load appearance preferences" },
      { status: 500 }
    );
  }
}

/**
 * Validates and persists the authenticated user's color theme.
 * @param request - Request containing exactly one supported colorTheme field.
 * @returns The persisted color theme as JSON.
 * @throws No errors to callers; malformed input and persistence failures become generic HTTP responses.
 */
export async function PUT(request: NextRequest) {
  const { user, error } = await requireSession();
  if (error) return error;

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const validation = appearancePreferenceSchema.safeParse(requestBody);
  if (!validation.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { colorTheme } = validation.data;

  try {
    await prisma.$executeRaw`
      INSERT INTO "UserAppearancePreference"
        ("id", "clerkUserId", "colorTheme", "createdAt", "updatedAt")
      VALUES
        (${randomUUID()}, ${user!.id}, ${colorTheme}, NOW(), NOW())
      ON CONFLICT ("clerkUserId")
      DO UPDATE SET
        "colorTheme" = EXCLUDED."colorTheme",
        "updatedAt" = NOW()
    `;

    return NextResponse.json({ colorTheme });
  } catch (persistenceError) {
    logPersistenceError("PUT", persistenceError);
    return NextResponse.json(
      { error: "Failed to save appearance preferences" },
      { status: 500 }
    );
  }
}
