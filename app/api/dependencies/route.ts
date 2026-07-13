import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  filterSeedDependencies,
} from "@/lib/dependency-view";
import { prisma } from "@/lib/prisma";
import { sp, str } from "@/lib/list-api-filters";

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const params = sp(req);

  const dependencies = await prisma.releaseDependency.findMany({
    include: {
      release: { select: { id: true, releaseCode: true, name: true } },
      dependsOnRelease: { select: { id: true, releaseCode: true, name: true } },
    },
    orderBy: { sourceOrder: "asc" },
  });
  const rows = dependencies.map((row) => ({
    id: row.id,
    depCode: row.dependencyCode ?? "",
    releaseCode: row.release.releaseCode,
    releaseName: row.release.name,
    releaseDbId: row.release.id,
    dependsOnCode: row.dependsOnRelease.releaseCode,
    dependsOnName: row.dependsOnRelease.name,
    dependsOnDbId: row.dependsOnRelease.id,
    dependencyType: row.dependencyType ?? "",
    status: row.status ?? "",
    impactIfBlocked: row.impactIfBlocked ?? "",
    notes: row.notes,
  }));

  const filtered = filterSeedDependencies(rows, {
    status: str(params, "status"),
    dependencyType: str(params, "type"),
    impact: str(params, "impact"),
    releaseCodeQ: str(params, "release"),
    dependsOnCodeQ: str(params, "dependsOn"),
    depCodeQ: str(params, "depCode"),
    releaseNameQ: str(params, "releaseName"),
    dependsOnNameQ: str(params, "dependsOnName"),
    notesQ: str(params, "notes"),
  });
  return NextResponse.json(filtered);
}
