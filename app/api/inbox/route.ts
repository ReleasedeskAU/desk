import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { parseReleaseFilters } from "@/lib/db-release-filter";
import { buildInboxItemsCached } from "@/lib/inbox";
import { ensureDbAwake, isRetryableDbError, prisma, withDbRetry } from "@/lib/prisma";
import type { Period } from "@/lib/unified-releases";

/** Neon cold starts on Vercel can exceed the default 10s hobby limit. */
export const maxDuration = 60;

/**
 * Morning Inbox aggregates for the selected period.
 * Retries Neon cold-starts; never leaks internal DB errors to the client.
 */
export async function GET(req: Request) {
  const { user, error } = await requireRole("readonly");
  if (error) return error;

  const url = new URL(req.url);
  const period = (url.searchParams.get("period") ?? "year") as Period;
  const filters = parseReleaseFilters(req);

  try {
    await ensureDbAwake();
    const payload = await withDbRetry(
      () =>
        buildInboxItemsCached({
          period,
          filters,
          sessionName: user?.name ?? "",
          prisma,
        }),
      { label: "inbox", attempts: 5, baseDelayMs: 800 }
    );
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[api/inbox]", err);
    const transient = isRetryableDbError(err);
    return NextResponse.json(
      {
        error: transient
          ? "Database temporarily unavailable"
          : "Failed to load inbox",
      },
      { status: transient ? 503 : 500, headers: transient ? { "Retry-After": "3" } : undefined }
    );
  }
}
