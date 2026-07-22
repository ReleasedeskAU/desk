import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { buildDashboardPayload } from "@/lib/dashboard-payload";
import { ensureDbAwake, isRetryableDbError, withDbRetry } from "@/lib/prisma";

/** Neon cold starts on Vercel can exceed the default 10s hobby limit. */
export const maxDuration = 60;

/**
 * Command Dashboard — live aggregates filtered by ?period=today|week|month|all
 */
export async function GET(req: Request) {
  const { user, error } = await requireRole("readonly");
  if (error) return error;

  try {
    await ensureDbAwake();
    const url = new URL(req.url);
    const { loadRiskEngineConfig } = await import("@/lib/risk-engine-config-db");
    const riskConfig = await loadRiskEngineConfig(user!.id);
    const payload = await withDbRetry(
      () => buildDashboardPayload(url.searchParams.get("period"), riskConfig),
      { label: "dashboard", attempts: 5, baseDelayMs: 800 }
    );
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/dashboard]", message);
    const transient = isRetryableDbError(err);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? transient
              ? "Database temporarily unavailable"
              : "Failed to load dashboard"
            : `Failed to load dashboard: ${message}`,
      },
      { status: transient ? 503 : 500, headers: transient ? { "Retry-After": "3" } : undefined }
    );
  }
}
