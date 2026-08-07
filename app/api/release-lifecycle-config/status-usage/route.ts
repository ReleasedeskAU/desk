/**
 * GET /api/release-lifecycle-config/status-usage
 *
 * Returns how many Release rows currently use each lifecycle status key/label.
 * Used by Settings to block deleting a custom status that is still in use.
 * Authenticated; counts are global Release.status values (not another user's config).
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { loadReleaseLifecycleConfig } from "@/lib/release-lifecycle-config-db";

function publicError(error: unknown): string {
  return process.env.NODE_ENV === "production"
    ? "Release lifecycle usage is temporarily unavailable"
    : error instanceof Error
      ? error.message.slice(0, 180)
      : "Unknown error";
}

/**
 * Count releases whose `status` matches a lifecycle status key or label
 * (case-insensitive). Keys without matches return 0.
 */
export async function GET() {
  const { user, error } = await requireSession();
  if (error) return error;

  try {
    const loaded = await loadReleaseLifecycleConfig(user!.id);
    const statuses = loaded.config.statuses;
    const grouped = await prisma.release.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    const usageByRaw = new Map<string, number>();
    for (const row of grouped) {
      usageByRaw.set(row.status.trim().toLocaleLowerCase(), row._count._all);
    }

    const usage: Record<string, number> = {};
    for (const status of statuses) {
      const byKey = usageByRaw.get(status.key.toLocaleLowerCase()) ?? 0;
      const byLabel = usageByRaw.get(status.label.trim().toLocaleLowerCase()) ?? 0;
      // Prefer key match; if seed data still uses labels, count those too —
      // but do not double-count when key === label.
      usage[status.key] =
        status.key.toLocaleLowerCase() === status.label.trim().toLocaleLowerCase()
          ? byKey
          : byKey + byLabel;
    }

    return NextResponse.json({ usage });
  } catch (loadError) {
    console.error("[release-lifecycle-config/status-usage] failed", {
      name: loadError instanceof Error ? loadError.name : "UnknownError",
    });
    return NextResponse.json({ error: publicError(loadError) }, { status: 503 });
  }
}
