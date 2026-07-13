import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { monitoringAlertWhere, sp } from "@/lib/list-api-filters";

/** Read-only for this pass — seeded monitoring data, no create/edit UI yet. */
export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.monitoringAlert.findMany({
    where: monitoringAlertWhere(sp(req)),
    include: { application: { select: { id: true, name: true } } },
    orderBy: { sourceOrder: "asc" },
  });
  return NextResponse.json(data);
}
