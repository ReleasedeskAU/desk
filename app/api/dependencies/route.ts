import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { filterSeedDependencies } from "@/lib/dependency-view";
import { loadDependencyLifecycleConfig } from "@/lib/dependency-lifecycle-config-db";
import { resolveCreateLifecycleStatus } from "@/lib/entity-lifecycle-create-guard";
import { prisma } from "@/lib/prisma";
import { sp, str } from "@/lib/list-api-filters";
import { createDependencySchema } from "@/lib/validation/dependency";
import { jsonError, zodErrorResponse } from "@/lib/api-errors";
import {
  guardDependencyGraphMutation,
  loadGuardReleaseConfig,
} from "@/lib/release-related-entity-guards";

function mapDependencyRow(row: {
  id: string;
  dependencyCode: string | null;
  dependencyType: string | null;
  status: string | null;
  impactIfBlocked: string | null;
  notes: string | null;
  release: { id: string; releaseCode: string; name: string };
  dependsOnRelease: { id: string; releaseCode: string; name: string };
}) {
  return {
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
  };
}

async function nextDependencyCode(): Promise<string> {
  const latest = await prisma.releaseDependency.findFirst({
    where: { dependencyCode: { not: null } },
    orderBy: { dependencyCode: "desc" },
    select: { dependencyCode: true },
  });
  const match = latest?.dependencyCode?.match(/^DEP-(\d+)$/i);
  const next = match ? Number(match[1]) + 1 : 1;
  return `DEP-${String(next).padStart(3, "0")}`;
}

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const params = sp(req);

  // Only full dependency records belong on the Dependencies desk — release-form
  // "depends on" links are lightweight stubs without DEP codes or status metadata.
  const dependencies = await prisma.releaseDependency.findMany({
    where: { dependencyCode: { not: null } },
    include: {
      release: { select: { id: true, releaseCode: true, name: true } },
      dependsOnRelease: { select: { id: true, releaseCode: true, name: true } },
    },
    orderBy: { sourceOrder: "asc" },
  });
  const rows = dependencies.map(mapDependencyRow);

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
    linkedReleaseQ: str(params, "linked"),
  });
  return NextResponse.json(filtered);
}

/** Create a release dependency (editor+). */
export async function POST(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const parsed = createDependencySchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const body = parsed.data;

  let status: string;
  let statusKey: string | undefined;
  try {
    const loaded = await loadDependencyLifecycleConfig(user!.id);
    const resolved = resolveCreateLifecycleStatus(loaded.config, body.status, "dependency");
    if (!resolved.ok) return resolved.response;
    status = resolved.status;
    statusKey = resolved.statusKey;
  } catch (err) {
    console.error("[dependencies-create] lifecycle config load failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Dependency lifecycle configuration is temporarily unavailable" },
      { status: 503 }
    );
  }

  try {
    const [release, dependsOn] = await Promise.all([
      prisma.release.findUnique({
        where: { id: body.releaseId },
        select: { id: true, status: true, lifecycleConfigVersionId: true },
      }),
      prisma.release.findUnique({
        where: { id: body.dependsOnReleaseId },
        select: { id: true },
      }),
    ]);
    if (!release || !dependsOn) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    const releaseConfig = await loadGuardReleaseConfig(
      user!.id,
      release.lifecycleConfigVersionId
    );
    const frozen = guardDependencyGraphMutation(release.status, releaseConfig);
    if (!frozen.ok) return frozen.response;

    const existing = await prisma.releaseDependency.findUnique({
      where: {
        releaseId_dependsOnReleaseId: {
          releaseId: body.releaseId,
          dependsOnReleaseId: body.dependsOnReleaseId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "This dependency already exists" }, { status: 409 });
    }

    const dependencyCode = await nextDependencyCode();
    const maxOrder = await prisma.releaseDependency.aggregate({ _max: { sourceOrder: true } });
    const sourceOrder = (maxOrder._max.sourceOrder ?? 0) + 1;

    const row = await prisma.releaseDependency.create({
      data: {
        dependencyCode,
        releaseId: body.releaseId,
        dependsOnReleaseId: body.dependsOnReleaseId,
        dependencyType: body.dependencyType,
        status,
        statusKey,
        impactIfBlocked: body.impactIfBlocked,
        notes: body.notes ?? null,
        sourceOrder,
      },
      include: {
        release: { select: { id: true, releaseCode: true, name: true } },
        dependsOnRelease: { select: { id: true, releaseCode: true, name: true } },
      },
    });

    return NextResponse.json(mapDependencyRow(row), { status: 201 });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ error: "This dependency already exists" }, { status: 409 });
    }
    return jsonError(err, {
      publicMessage: "Failed to create dependency",
      status: 500,
      logLabel: "api/dependencies POST",
    });
  }
}
