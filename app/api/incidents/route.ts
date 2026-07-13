import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { incidentWhere, sp } from "@/lib/list-api-filters";

/**
 * Read-only for this pass — seeded incident register, distinct from
 * /api/p1-issues (connector-synced). See Incident model doc comment in
 * schema.prisma for the full rationale.
 */
export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.incident.findMany({
    where: incidentWhere(sp(req)),
    include: { application: { select: { id: true, name: true } } },
    orderBy: { sourceOrder: "asc" },
  });

  const releaseCodes = [...new Set(data.map((d) => d.relatedReleaseCode).filter(Boolean))] as string[];
  const releases = releaseCodes.length
    ? await prisma.release.findMany({
        where: { releaseCode: { in: releaseCodes } },
        select: { id: true, releaseCode: true, name: true },
      })
    : [];
  const releaseByCode = new Map(releases.map((r) => [r.releaseCode, r]));

  const enriched = data.map((d) => ({
    ...d,
    relatedRelease: d.relatedReleaseCode ? releaseByCode.get(d.relatedReleaseCode) ?? null : null,
  }));

  return NextResponse.json(enriched);
}
