import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { checkSyncNowRateLimit } from "@/lib/connectors/rate-limit";
import { runStafflessConnectorOnce } from "@/lib/staffless/api";
import { stafflessHttpStatus, stafflessPublicMessage } from "@/lib/staffless/client";
import { logger } from "@/lib/logger";

function parseConnectorId(id: string): number | null {
  if (!/^\d+$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const connectorId = parseConnectorId(id);
  if (connectorId == null) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  const limit = checkSyncNowRateLimit(id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Please wait before syncing again", retryAfterSec: limit.retryAfterSec },
      { status: 429 }
    );
  }

  try {
    await runStafflessConnectorOnce(connectorId);
    return NextResponse.json({
      ok: true,
      status: "PENDING",
      message: "Index run queued on StaffLess AI.",
    });
  } catch (err) {
    logger.error("api/connectors/sync-now", { kind: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json(
      { error: stafflessPublicMessage(err) },
      { status: stafflessHttpStatus(err) }
    );
  }
}
