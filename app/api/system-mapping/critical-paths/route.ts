import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import {
  parseSystemMappingBody,
  systemMappingErrorResponse,
} from "@/lib/system-mapping-api";
import { createCriticalPathSchema } from "@/lib/validation/system-mapping";

/** Returns critical integration paths in workbook order. */
export async function GET() {
  const { error } = await requireRole("readonly");
  if (error) return error;

  try {
    const items = await prisma.systemCriticalPath.findMany({
      orderBy: [{ sourceOrder: "asc" }, { id: "asc" }],
    });
    return NextResponse.json({ items });
  } catch (routeError) {
    return systemMappingErrorResponse(routeError, "system-mapping critical-paths GET failed");
  }
}

/** Creates a strictly validated critical integration path. */
export async function POST(request: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = await parseSystemMappingBody(request, createCriticalPathSchema);
  if (parsed.error) return parsed.error;

  try {
    const item = await prisma.$transaction(async (transaction) => {
      const latest = await transaction.systemCriticalPath.aggregate({
        _max: { sourceOrder: true },
      });
      return transaction.systemCriticalPath.create({
        data: {
          ...parsed.data,
          sourceOrder: parsed.data.sourceOrder ?? (latest._max.sourceOrder ?? 0) + 1,
        },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (routeError) {
    return systemMappingErrorResponse(routeError, "system-mapping critical-paths POST failed");
  }
}
