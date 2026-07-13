import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { applicationStatusWhere, sp } from "@/lib/list-api-filters";

/**
 * Read-only for this pass. CURRENT STATE data — one row per
 * (application, environment), overwritten on each check, not a history log.
 */
export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.applicationStatus.findMany({
    where: applicationStatusWhere(sp(req)),
    include: {
      application: {
        select: { id: true, name: true, department: { select: { name: true } } },
      },
    },
    orderBy: { sourceOrder: "asc" },
  });
  return NextResponse.json(data);
}
