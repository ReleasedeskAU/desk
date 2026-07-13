import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row =
    (await prisma.plannedMaintenance.findUnique({
      where: { id },
      include: { application: { select: { id: true, name: true } } },
    })) ??
    (await prisma.plannedMaintenance.findUnique({
      where: { maintenanceCode: id },
      include: { application: { select: { id: true, name: true } } },
    }));

  if (!row) return NextResponse.json({ error: "Maintenance not found" }, { status: 404 });
  return NextResponse.json(row);
}
