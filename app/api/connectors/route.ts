import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { stripCredentialsList } from "@/lib/connectors/public";
import { encryptCredentials } from "@/lib/connectorCrypto";
import { getConnectorTypeDef } from "@/lib/connectors/types";
import { normalizeDataTypes } from "@/lib/connectorDataTypes";
import { createConnectorRow } from "@/lib/org-compat";

function buildConfig(type: string, config: Record<string, unknown> | undefined) {
  const typeDef = getConnectorTypeDef(type);
  const dataTypes = normalizeDataTypes(type, config?.dataTypes as string[] | undefined);
  if (dataTypes.length === 0) {
    return null;
  }
  return {
    ...(config ?? {}),
    dataTypes,
    targetModel: typeDef?.targetModel ?? "WorkItem",
  };
}

export async function GET() {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const rows = await prisma.connector.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(stripCredentialsList(rows));
}

export async function POST(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const body = (await req.json()) as {
    name?: string;
    type?: string;
    authType?: string;
    baseUrl?: string;
    credentials?: Record<string, string>;
    config?: Record<string, unknown>;
    pollInterval?: number;
    enabled?: boolean;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!body.type) {
    return NextResponse.json({ error: "Connector type is required" }, { status: 400 });
  }
  if (!body.credentials || Object.keys(body.credentials).length === 0) {
    return NextResponse.json({ error: "Credentials are required" }, { status: 400 });
  }

  const typeDef = getConnectorTypeDef(body.type);
  if (!typeDef?.available) {
    return NextResponse.json({ error: "Connector type is not available yet" }, { status: 400 });
  }

  const encrypted = encryptCredentials(body.credentials);
  const config = buildConfig(body.type, body.config);
  if (!config) {
    return NextResponse.json({ error: "Select at least one data type to sync" }, { status: 400 });
  }

  // Live Neon requires organizationId on Connector — use org-compat helper.
  const row = await createConnectorRow({
    name: body.name.trim(),
    type: body.type,
    authType: body.authType ?? typeDef.authType,
    baseUrl: body.baseUrl ?? null,
    credentials: encrypted,
    config,
    pollInterval: body.pollInterval ?? typeDef.defaultPollInterval,
    enabled: body.enabled ?? true,
    createdBy: user?.name ?? null,
    status: "PENDING",
  });

  const { credentials: _c, ...safe } = row;
  return NextResponse.json(safe, { status: 201 });
}
