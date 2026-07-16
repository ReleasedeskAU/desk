import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { integrationFlowWhere, sp } from "@/lib/list-api-filters";
import { zodErrorResponse } from "@/lib/api-errors";
import { createIntegrationFlowSchema } from "@/lib/validation/integration-flow";

async function nextFlowCode(): Promise<string> {
  const rows = await prisma.integrationFlow.findMany({ select: { flowCode: true } });
  const next = rows.reduce((max, row) => {
    const match = row.flowCode.match(/^INT-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  return `INT-${String(next).padStart(3, "0")}`;
}

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.integrationFlow.findMany({
    where: integrationFlowWhere(sp(req)),
    orderBy: { sourceOrder: "asc" },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = createIntegrationFlowSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  const maxOrder = await prisma.integrationFlow.aggregate({ _max: { sourceOrder: true } });
  const row = await prisma.integrationFlow.create({
    data: {
      flowCode: await nextFlowCode(),
      sourceSystem: body.sourceSystem,
      targetSystem: body.targetSystem,
      integrationType: body.integrationType,
      frequency: body.frequency,
      dataElements: body.dataElements,
      businessPurpose: body.businessPurpose,
      sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
    },
  });
  return NextResponse.json(row, { status: 201 });
}
