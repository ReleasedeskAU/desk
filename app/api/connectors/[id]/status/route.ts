import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { listStafflessConnectors } from "@/lib/staffless/api";
import { stafflessHttpStatus, stafflessPublicMessage } from "@/lib/staffless/client";
import { logger } from "@/lib/logger";

/**
 * POST /admin/connector/indexing-status via StaffLess AI, then return this row.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  try {
    const rows = await listStafflessConnectors();
    const row = rows.find((r) => r.id === id);
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
