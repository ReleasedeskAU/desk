import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { createStafflessConnector, listStafflessConnectors } from "@/lib/staffless/api";
import { stafflessHttpStatus, stafflessPublicMessage } from "@/lib/staffless/client";
import { logger } from "@/lib/logger";

export async function GET() {
  const { error } = await requireRole("readonly");
  if (error) return error;

  try {
    const rows = await listStafflessConnectors();
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("api/connectors.GET", { kind: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json(
      { error: stafflessPublicMessage(err) },
      { status: stafflessHttpStatus(err) }
    );
  }
}

export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const body = (await req.json()) as {
    name?: string;
    type?: string;
    baseUrl?: string;
    credentials?: Record<string, string>;
    config?: Record<string, unknown>;
    pollInterval?: number;
  };

  if (!body.name?.trim() || !body.type || !body.credentials) {
    return NextResponse.json({ error: "Name, type, and credentials are required" }, { status: 400 });
  }

  try {
    const created = await createStafflessConnector({
      name: body.name.trim(),
      type: body.type,
      baseUrl: body.baseUrl,
      credentials: body.credentials,
      config: body.config,
      pollInterval: body.pollInterval,
    });
    return NextResponse.json({ id: String(created.id), name: body.name.trim(), type: body.type }, { status: 201 });
  } catch (err) {
    logger.error("api/connectors.POST", { kind: err instanceof Error ? err.name : "unknown" });
    const message = err instanceof Error && err.message.startsWith("Only Jira")
      ? err.message
      : err instanceof Error && err.message.includes("needs")
        ? err.message
        : stafflessPublicMessage(err);
    const status = message === stafflessPublicMessage(err) ? stafflessHttpStatus(err) : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
