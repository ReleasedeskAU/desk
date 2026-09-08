import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { findStafflessConnector } from "@/lib/staffless/api";
import { parseStafflessId } from "@/lib/staffless/ids";
import { stafflessHttpStatus, stafflessPublicMessage } from "@/lib/staffless/client";
import { logger } from "@/lib/logger";

/** Refresh this connector row from StaffLess indexing-status. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json(row);
  } catch (err) {
    logger.error("api/connectors/status", { kind: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json(
      { error: stafflessPublicMessage(err) },
      { status: stafflessHttpStatus(err) }
    );
  }
}
