import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { getConnectorTypeDef } from "@/lib/connectors/types";
import { planStafflessCreate } from "@/lib/staffless/create-payload";

/**
 * Validate wizard fields locally. StaffLess AI verifies credentials on first Sync Now
 * (no separate test endpoint). Never forwards secrets to connector-engine.
 */
export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const body = (await req.json()) as {
    type?: string;
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
    planStafflessCreate({
      name: "test",
      type: body.type,
      baseUrl: body.baseUrl,
      credentials: body.credentials,
      config: body.config,
    });
    return NextResponse.json({
      ok: true,
      message: "Fields look valid. StaffLess AI will verify credentials on Sync Now.",
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: err instanceof Error ? err.message : "Invalid connector fields",
    });
  }
}
