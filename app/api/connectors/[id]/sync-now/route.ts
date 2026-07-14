import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { checkSyncNowRateLimit } from "@/lib/connectors/rate-limit";
import { syncConnectorById } from "@/lib/connectorEngineClient";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const connector = await prisma.connector.findUnique({ where: { id } });
  if (!connector) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  const limit = checkSyncNowRateLimit(id);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Please wait before syncing again",
        retryAfterSec: limit.retryAfterSec,
      },
      { status: 429 }
    );
  }

  try {
    const result = await syncConnectorById(id);
    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      lastSyncedAt: result.lastSyncedAt,
      message:
        result.status === "ERROR"
          ? "Sync completed with errors. Check connector logs for details."
          : "Sync completed successfully.",
      lastError: result.lastError ?? null,
    });
  } catch (err) {
    const { logger } = await import("@/lib/logger");
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("api/connectors/[id]/sync-now", { detail: detail.slice(0, 500) });
    return NextResponse.json({ error: "Connector engine unavailable" }, { status: 502 });
  }
}
