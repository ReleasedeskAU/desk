import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row =
    (await prisma.incident.findUnique({
      where: { id },
      include: { application: { select: { id: true, name: true } } },
    })) ??
    (await prisma.incident.findUnique({
      where: { incidentCode: id },
      include: { application: { select: { id: true, name: true } } },
    }));

  if (!row) return NextResponse.json({ error: "Incident not found" }, { status: 404 });

  const relatedRelease = row.relatedReleaseCode
    ? await prisma.release.findUnique({
        where: { releaseCode: row.relatedReleaseCode },
        select: { id: true, releaseCode: true, name: true, status: true },
      })
    : null;

  return NextResponse.json({ ...row, relatedRelease });
}
