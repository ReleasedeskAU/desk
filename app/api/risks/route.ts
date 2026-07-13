import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { riskWhere, sp } from "@/lib/list-api-filters";

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.risk.findMany({
    where: riskWhere(sp(req)),
    include: {
      release: {
        select: {
          id: true,
          releaseCode: true,
          name: true,
          status: true,
          startDate: true,
          releaseDate: true,
        },
      },
      riskOwner: { select: { id: true, userId: true, name: true, email: true } },
    },
    orderBy: { sourceOrder: "asc" },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const body = await req.json();
  const likelihood = Number(body.likelihood);
  const impact = Number(body.impact);
  const row = await prisma.risk.create({
    data: {
      riskCode: body.riskCode,
      releaseId: body.releaseId,
      category: body.category,
      description: body.description,
      likelihood,
      impact,
      // Always server-computed — never trust a client-supplied riskScore.
      riskScore: likelihood * impact,
      affectedArea: body.affectedArea ?? null,
      mitigationStrategy: body.mitigationStrategy ?? null,
      riskOwnerId: body.riskOwnerId ?? null,
      status: body.status ?? "Open",
      notes: body.notes ?? null,
    },
    include: {
      release: { select: { id: true, releaseCode: true, name: true } },
      riskOwner: { select: { id: true, userId: true, name: true } },
    },
  });
  return NextResponse.json(row, { status: 201 });
}
