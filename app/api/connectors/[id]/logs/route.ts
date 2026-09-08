import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { findStafflessConnector, listStafflessSyncLogs, StafflessIdError } from "@/lib/staffless/api";
import { parseStafflessId } from "@/lib/staffless/ids";
import { stafflessHttpStatus, stafflessPublicMessage } from "@/lib/staffless/client";
import { logger } from "@/lib/logger";

/**
 * Live StaffLess sync snapshot: indexing-status, index attempts, unresolved errors.
 * URL id is the StaffLess connector id or cc_pair_id — not a Prisma row.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole("readonly");
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
    const view = await listStafflessSyncLogs(row);
    return NextResponse.json(view);
  } catch (err) {
    if (err instanceof StafflessIdError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error("api/connectors/logs", { kind: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json({ error: stafflessPublicMessage(err) }, { status: stafflessHttpStatus(err) });
  }
}
