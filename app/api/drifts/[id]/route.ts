import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row =
    (await prisma.drift.findUnique({
      where: { id },
      include: {
        release: { select: { id: true, releaseCode: true, name: true, status: true } },
        application: { select: { id: true, name: true } },
      },
    })) ??
    (await prisma.drift.findUnique({
      where: { driftCode: id },
      include: {
        release: { select: { id: true, releaseCode: true, name: true, status: true } },
        application: { select: { id: true, name: true } },
      },
    }));

  if (!row) return NextResponse.json({ error: "Drift not found" }, { status: 404 });
  return NextResponse.json(row);
}
