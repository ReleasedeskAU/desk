import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row =
    (await prisma.integrationFlow.findUnique({ where: { id } })) ??
    (await prisma.integrationFlow.findUnique({ where: { flowCode: id } }));

  if (!row) return NextResponse.json({ error: "Integration flow not found" }, { status: 404 });
  return NextResponse.json(row);
}
