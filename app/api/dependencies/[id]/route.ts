import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row =
    (await prisma.releaseDependency.findUnique({
      where: { id },
      include: {
        release: { select: { id: true, releaseCode: true, name: true, status: true } },
        dependsOnRelease: { select: { id: true, releaseCode: true, name: true, status: true } },
      },
    })) ??
    (await prisma.releaseDependency.findFirst({
      where: { dependencyCode: id },
      include: {
        release: { select: { id: true, releaseCode: true, name: true, status: true } },
        dependsOnRelease: { select: { id: true, releaseCode: true, name: true, status: true } },
      },
    }));

  if (!row) return NextResponse.json({ error: "Dependency not found" }, { status: 404 });

  return NextResponse.json({
    id: row.id,
    depCode: row.dependencyCode ?? "",
    dependencyType: row.dependencyType ?? "",
    status: row.status ?? "",
    impactIfBlocked: row.impactIfBlocked ?? "",
    notes: row.notes,
    release: row.release,
    dependsOnRelease: row.dependsOnRelease,
  });
}
