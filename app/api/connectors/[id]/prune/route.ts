import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { findStafflessConnector, pruneStafflessConnector, StafflessIdError } from "@/lib/staffless/api";
import { parseStafflessId } from "@/lib/staffless/ids";
import { stafflessHttpStatus, stafflessPublicMessage } from "@/lib/staffless/client";
import { logger } from "@/lib/logger";

/**
 * Queue StaffLess prune for this cc-pair (remove indexed docs that no longer exist in the source).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  if (parseStafflessId(id) == null) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  try {
    const row = await findStafflessConnector(id);
    if (!row) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }
    await pruneStafflessConnector(row);
    return NextResponse.json({ ok: true, message: "Prune queued on StaffLess AI." });
  } catch (err) {
    if (err instanceof StafflessIdError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error("api/connectors/prune", { kind: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json({ error: stafflessPublicMessage(err) }, { status: stafflessHttpStatus(err) });
  }
}
