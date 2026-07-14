import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { testConnectorConnection } from "@/lib/connectorEngineClient";
import { getConnectorTypeDef } from "@/lib/connectors/types";

export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const body = (await req.json()) as {
    type?: string;
    authType?: string;
    baseUrl?: string;
    credentials?: Record<string, string>;
    config?: Record<string, unknown>;
  };

  if (!body.type || !body.credentials) {
    return NextResponse.json({ error: "Type and credentials are required" }, { status: 400 });
  }

  const typeDef = getConnectorTypeDef(body.type);
  if (!typeDef?.available) {
    return NextResponse.json({ ok: false, message: "Connector type is not available yet" });
  }

  try {
    const result = await testConnectorConnection({
      type: body.type,
      authType: body.authType ?? typeDef.authType,
      baseUrl: body.baseUrl ?? null,
      credentials: body.credentials,
      config: body.config ?? {},
    });
    return NextResponse.json(result);
  } catch (err) {
    const { logger } = await import("@/lib/logger");
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("api/connectors/test", { detail: detail.slice(0, 500) });
    return NextResponse.json({ ok: false, message: "Connector engine unavailable" }, { status: 502 });
  }
}
