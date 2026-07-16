import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import {
  parseSystemMappingBody,
  systemMappingErrorResponse,
} from "@/lib/system-mapping-api";
import { createSystemCoreRecordSchema } from "@/lib/validation/system-mapping";

/** Returns the curated core system records in workbook order. */
export async function GET() {
  const { error } = await requireRole("readonly");
  if (error) return error;

  try {
    const items = await prisma.systemCoreRecord.findMany({
      orderBy: [{ sourceOrder: "asc" }, { id: "asc" }],
    });
    return NextResponse.json({ items });
  } catch (routeError) {
    return systemMappingErrorResponse(routeError, "system-mapping systems GET failed");
  }
}

/** Creates a strictly validated core system record. */
export async function POST(request: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = await parseSystemMappingBody(request, createSystemCoreRecordSchema);
  if (parsed.error) return parsed.error;

  try {
    const item = await prisma.$transaction(async (transaction) => {
      const latest = await transaction.systemCoreRecord.aggregate({ _max: { sourceOrder: true } });
      return transaction.systemCoreRecord.create({
        data: {
          ...parsed.data,
          sourceOrder: parsed.data.sourceOrder ?? (latest._max.sourceOrder ?? 0) + 1,
        },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (routeError) {
    return systemMappingErrorResponse(routeError, "system-mapping systems POST failed");
  }
}
