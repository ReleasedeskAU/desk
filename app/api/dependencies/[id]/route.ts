import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { patchDependencySchema } from "@/lib/validation/dependency";
import { jsonError, zodErrorResponse } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

async function findDependency(id: string) {
  return (
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
    }))
  );
}

function mapDetail(row: NonNullable<Awaited<ReturnType<typeof findDependency>>>) {
  return {
    id: row.id,
    depCode: row.dependencyCode ?? "",
    dependencyType: row.dependencyType ?? "",
    status: row.status ?? "",
    impactIfBlocked: row.impactIfBlocked ?? "",
    notes: row.notes,
    release: row.release,
    dependsOnRelease: row.dependsOnRelease,
  };
}

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row = await findDependency(id);
  if (!row) return NextResponse.json({ error: "Dependency not found" }, { status: 404 });
  return NextResponse.json(mapDetail(row));
}

/** Update allowlisted dependency fields (editor+). */
export async function PATCH(req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findDependency(id);
  if (!existing) return NextResponse.json({ error: "Dependency not found" }, { status: 404 });

  const parsed = patchDependencySchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const nextReleaseId = body.releaseId ?? existing.releaseId;
  const nextDependsOnId = body.dependsOnReleaseId ?? existing.dependsOnReleaseId;
  if (nextReleaseId === nextDependsOnId) {
    return NextResponse.json({ error: "A release cannot depend on itself" }, { status: 400 });
  }

  try {
    if (body.releaseId || body.dependsOnReleaseId) {
      const [release, dependsOn] = await Promise.all([
        prisma.release.findUnique({ where: { id: nextReleaseId }, select: { id: true } }),
        prisma.release.findUnique({ where: { id: nextDependsOnId }, select: { id: true } }),
      ]);
      if (!release || !dependsOn) {
        return NextResponse.json({ error: "Release not found" }, { status: 404 });
      }

      const clash = await prisma.releaseDependency.findFirst({
        where: {
          releaseId: nextReleaseId,
          dependsOnReleaseId: nextDependsOnId,
          NOT: { id: existing.id },
        },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json({ error: "This dependency already exists" }, { status: 409 });
      }
    }

    const row = await prisma.releaseDependency.update({
      where: { id: existing.id },
      data: {
        ...(body.releaseId !== undefined ? { releaseId: body.releaseId } : {}),
        ...(body.dependsOnReleaseId !== undefined
          ? { dependsOnReleaseId: body.dependsOnReleaseId }
          : {}),
        ...(body.dependencyType !== undefined ? { dependencyType: body.dependencyType } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.impactIfBlocked !== undefined ? { impactIfBlocked: body.impactIfBlocked } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
      include: {
        release: { select: { id: true, releaseCode: true, name: true, status: true } },
        dependsOnRelease: { select: { id: true, releaseCode: true, name: true, status: true } },
      },
    });

    return NextResponse.json(mapDetail(row));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ error: "This dependency already exists" }, { status: 409 });
    }
    return jsonError(err, {
      publicMessage: "Failed to update dependency",
      status: 500,
      logLabel: "api/dependencies/[id] PATCH",
    });
  }
}

/** Delete a dependency (editor+). */
export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findDependency(id);
  if (!existing) return NextResponse.json({ error: "Dependency not found" }, { status: 404 });

  try {
    await prisma.releaseDependency.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err, {
      publicMessage: "Failed to delete dependency",
      status: 500,
      logLabel: "api/dependencies/[id] DELETE",
    });
  }
}
