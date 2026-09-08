import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/api";
import {
  deleteStafflessConnector,
  findStafflessConnector,
  isStafflessConnectorType,
  setStafflessConnectorPaused,
  updateStafflessConnector,
  StafflessIdError,
} from "@/lib/staffless/api";
import { parseStafflessId } from "@/lib/staffless/ids";
import { StafflessApiError, stafflessHttpStatus, stafflessPublicMessage } from "@/lib/staffless/client";
import { logger } from "@/lib/logger";

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    name: z.string().trim().min(1).max(200).optional(),
    baseUrl: z.string().trim().max(500).optional(),
    config: z.record(z.unknown()).optional(),
    pollInterval: z.number().int().min(5).max(1440).optional(),
    credentials: z.record(z.string()).optional(),
  })
  .strict();

function routeError(err: unknown, logKey: string) {
  if (err instanceof StafflessIdError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  logger.error(logKey, { kind: err instanceof Error ? err.name : "unknown" });
  return NextResponse.json({ error: stafflessPublicMessage(err) }, { status: stafflessHttpStatus(err) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  if (parseStafflessId(id) == null) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid connector update" }, { status: 400 });
  }
  const body = parsed.data;
  if (
    body.enabled === undefined &&
    body.name === undefined &&
    body.baseUrl === undefined &&
    body.config === undefined &&
    body.pollInterval === undefined &&
    body.credentials === undefined
  ) {
    return NextResponse.json({ error: "No connector fields to update" }, { status: 400 });
  }

  try {
    const row = await findStafflessConnector(id);
    if (!row) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }
    if (typeof body.enabled === "boolean") {
      await setStafflessConnectorPaused(row, !body.enabled);
    }
    const hasConfigUpdate =
      body.name != null || body.baseUrl != null || body.config != null || body.pollInterval != null || body.credentials != null;
    if (hasConfigUpdate) {
      if (!isStafflessConnectorType(row.type)) {
        return NextResponse.json({ error: "This connector type cannot be edited in Release Desk" }, { status: 400 });
      }
      await updateStafflessConnector(row, {
        name: body.name ?? row.name,
        type: row.type,
        baseUrl: body.baseUrl ?? row.baseUrl ?? undefined,
        config: (body.config ?? row.config ?? {}) as Record<string, unknown>,
        pollInterval: body.pollInterval ?? row.pollInterval,
        credentials: body.credentials,
      });
    }
    const updated = await findStafflessConnector(id);
    return NextResponse.json(updated ?? { id });
  } catch (err) {
    return routeError(err, "api/connectors.PATCH");
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    await deleteStafflessConnector(row);
    return NextResponse.json({
      ok: true,
      message: "Deletion scheduled. Indexed copies will be removed; the source system is unchanged.",
    });
  } catch (err) {
    if (err instanceof StafflessApiError && (err.status === 401 || err.status === 403)) {
      return NextResponse.json(
        {
          error:
            "StaffLess would not delete this connector. The service account needs StaffLess administrator access.",
        },
        { status: err.status }
      );
    }
    if (err instanceof StafflessApiError && err.status === 404) {
      return NextResponse.json(
        { error: "StaffLess could not find this connector-credential pair. It may already be deleted." },
        { status: 404 }
      );
    }
    return routeError(err, "api/connectors.DELETE");
  }
}
