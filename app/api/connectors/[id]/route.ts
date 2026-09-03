import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { listStafflessConnectors } from "@/lib/staffless/api";
import { stafflessFetch, stafflessHttpStatus, stafflessPublicMessage } from "@/lib/staffless/client";
import { logger } from "@/lib/logger";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  const body = (await req.json()) as { enabled?: boolean };
  try {
    if (typeof body.enabled === "boolean") {
      const rows = await listStafflessConnectors();
      const row = rows.find((r) => r.id === id);
      if (row?.ccPairId == null) {
        return NextResponse.json({ error: "Connector not found" }, { status: 404 });
      }
      await stafflessFetch(`/api/manage/admin/cc-pair/${row.ccPairId}/status`, {
        method: "PUT",
        json: { status: body.enabled ? "ACTIVE" : "PAUSED" },
      });
    }
    const rows = await listStafflessConnectors();
    const updated = rows.find((r) => r.id === id);
    return NextResponse.json(updated ?? { id });
  } catch (err) {
    logger.error("api/connectors.PATCH", { kind: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json(
      { error: stafflessPublicMessage(err) },
      { status: stafflessHttpStatus(err) }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  try {
    await stafflessFetch(`/api/manage/admin/connector/${id}`, { method: "DELETE" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("api/connectors.DELETE", { kind: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json(
      { error: stafflessPublicMessage(err) },
      { status: stafflessHttpStatus(err) }
    );
  }
}
