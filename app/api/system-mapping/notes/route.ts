import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { systemMappingErrorResponse } from "@/lib/system-mapping-api";

/** Returns persisted release-manager notes in workbook order. */
export async function GET() {
  const { error } = await requireRole("readonly");
  if (error) return error;

  try {
    const items = await prisma.systemReleaseManagerNote.findMany({
      orderBy: [{ sourceOrder: "asc" }, { id: "asc" }],
    });
    return NextResponse.json({ items });
  } catch (routeError) {
    return systemMappingErrorResponse(routeError, "system-mapping notes GET failed");
  }
}
