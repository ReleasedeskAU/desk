import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { calendarEventWhere, sp } from "@/lib/list-api-filters";

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.calendarEvent.findMany({
    where: calendarEventWhere(sp(req)),
    include: {
      release: {
        select: {
          releaseCode: true,
          status: true,
        },
      },
    },
    orderBy: { sourceOrder: "asc" },
  });

  return NextResponse.json(data);
}
