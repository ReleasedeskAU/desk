import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { buildDashboardPayload } from "@/lib/dashboard-payload";
import { ensureDbAwake } from "@/lib/prisma";

/**
 * Command Dashboard — live aggregates filtered by ?period=today|week|month|all
 */
export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  try {
    // Neon / Turbopack cold starts — wake before the fan-out of aggregate queries.
    await ensureDbAwake();
    const url = new URL(req.url);
    const payload = await buildDashboardPayload(url.searchParams.get("period"));
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/dashboard]", message);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Failed to load dashboard"
            : `Failed to load dashboard: ${message}`,
      },
      { status: 500 }
    );
  }
}
