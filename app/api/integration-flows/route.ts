import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { integrationFlowWhere, sp } from "@/lib/list-api-filters";

/** Read-only for this pass — seeded integration flows, no create/edit UI yet. */
export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.integrationFlow.findMany({
    where: integrationFlowWhere(sp(req)),
    orderBy: { sourceOrder: "asc" },
  });
  return NextResponse.json(data);
}
