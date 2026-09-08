import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/api";
import { checkSyncNowRateLimit } from "@/lib/connectors/rate-limit";
import { findStafflessConnector, runStafflessConnectorOnce, StafflessIdError } from "@/lib/staffless/api";
import { parseStafflessId } from "@/lib/staffless/ids";
import { stafflessHttpStatus, stafflessPublicMessage } from "@/lib/staffless/client";
import { logger } from "@/lib/logger";

const bodySchema = z.object({ fromBeginning: z.boolean().optional() }).strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const connectorId = parseStafflessId(id);
  if (connectorId == null) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  let fromBeginning = false;
  const text = await req.text();
  if (text.trim()) {
    try {
      const parsed = bodySchema.safeParse(JSON.parse(text) as unknown);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid sync request" }, { status: 400 });
      }
      fromBeginning = parsed.data.fromBeginning === true;
    } catch {
      return NextResponse.json({ error: "Invalid sync request" }, { status: 400 });
    }
  }

  const limit = checkSyncNowRateLimit(`${id}:${fromBeginning ? "full" : "once"}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Please wait before syncing again", retryAfterSec: limit.retryAfterSec },
      { status: 429 }
    );
  }

  try {
    const row = await findStafflessConnector(id);
    if (!row) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }
    if (!row.enabled || row.status === "DELETING") {
      return NextResponse.json({ error: "Pause or deletion is in progress; sync is not available" }, { status: 409 });
    }
    await runStafflessConnectorOnce(connectorId, fromBeginning);
    return NextResponse.json({
      ok: true,
      status: "PENDING",
      message: fromBeginning ? "Full re-index queued on StaffLess AI." : "Index run queued on StaffLess AI.",
    });
  } catch (err) {
    if (err instanceof StafflessIdError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error("api/connectors/sync-now", { kind: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json({ error: stafflessPublicMessage(err) }, { status: stafflessHttpStatus(err) });
  }
}
