import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { normalizeProgramProject } from "@/lib/release-id";

const releaseInclude = {
  department: true,
  releaseOwner: { select: { id: true, userId: true, name: true, email: true, role: true } },
  stakeholders: { include: { user: { select: { id: true, userId: true, name: true, email: true, role: true } } } },
  applications: { include: { application: { include: { department: true } } } },
  dependsOn: { include: { dependsOnRelease: true } },
  dependedBy: { include: { release: true } },
  bookings: { include: { application: true, environment: true } },
  auditEvents: { orderBy: { createdAt: "desc" as const }, take: 50 },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("readonly");
  if (error) return error;

  // Accept both UUID primary key and releaseCode (e.g. REL-0002)
  const row = await prisma.release.findFirst({
    where: { OR: [{ id }, { releaseCode: id }] },
    include: releaseInclude,
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function optionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function optionalFloat(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const body = await req.json();
  // Resolve actual record — accept UUID or releaseCode
  const existing = await prisma.release.findFirst({ where: { OR: [{ id }, { releaseCode: id }] } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const realId = existing.id;

  const data: Record<string, unknown> = {};
  for (const key of ["name", "owner", "status", "priority", "impact", "decision", "departmentId", "releaseCode"]) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  if (body.programProject !== undefined) {
    data.programProject = normalizeProgramProject(body.programProject) ?? "N/A";
  }

  for (const key of [
    "notes",
    "dependencies",
    "releaseSize",
    "testEnvRequired",
    "uatEnvRequired",
    "conflictId",
    "blockers",
    "vendorMaintenance",
    "changeFreeze",
    "regulatory",
    "approvalStatus",
    "rollbackPlan",
    "deploymentWindow",
  ] as const) {
    const v = optionalString(body[key]);
    if (v !== undefined) data[key] = v;
  }

  if (body.conflictFlag !== undefined) data.conflictFlag = Boolean(body.conflictFlag);
  if (body.releaseOwnerId !== undefined) data.releaseOwnerId = optionalString(body.releaseOwnerId);

  for (const key of ["releaseDate", "cabDate", "startDate"] as const) {
    const v = optionalDate(body[key]);
    if (v !== undefined) data[key] = v;
  }
  for (const key of ["readinessPercent", "goLiveChecklistPercent"] as const) {
    const v = optionalFloat(body[key]);
    if (v !== undefined) data[key] = v;
  }

  await prisma.release.update({ where: { id: realId }, data });

  if (body.applicationIds) {
    await prisma.releaseApplication.deleteMany({ where: { releaseId: realId } });
    if (body.applicationIds.length) {
      await prisma.releaseApplication.createMany({
        data: body.applicationIds.map((applicationId: string) => ({ releaseId: realId, applicationId })),
      });
    }
  }

  if (body.dependsOnReleaseIds) {
    const dependsOnReleaseIds = body.dependsOnReleaseIds as string[];
    // Preserve tracked dependencies (DEP-*) — only sync lightweight release-form links.
    await prisma.releaseDependency.deleteMany({
      where: {
        releaseId: realId,
        dependencyCode: null,
        ...(dependsOnReleaseIds.length
          ? { dependsOnReleaseId: { notIn: dependsOnReleaseIds } }
          : {}),
      },
    });
    for (const dependsOnReleaseId of dependsOnReleaseIds) {
      const existing = await prisma.releaseDependency.findUnique({
        where: {
          releaseId_dependsOnReleaseId: { releaseId: realId, dependsOnReleaseId },
        },
        select: { id: true },
      });
      if (!existing) {
        await prisma.releaseDependency.create({
          data: { releaseId: realId, dependsOnReleaseId },
        });
      }
    }
  }

  if (body.stakeholderIds) {
    await prisma.releaseStakeholder.deleteMany({ where: { releaseId: realId } });
    if (body.stakeholderIds.length) {
      await prisma.releaseStakeholder.createMany({
        data: body.stakeholderIds.map((userId: string) => ({ releaseId: realId, userId })),
      });
    }
  }

  if (body.status && body.status !== existing.status) {
    await prisma.releaseAuditEvent.create({
      data: {
        releaseId: realId,
        action: "status_change",
        actor: user!.name,
        detail: `Status changed to ${body.status}`,
      },
    });
  }

  const updated = await prisma.release.findUnique({ where: { id: realId }, include: releaseInclude });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("editor");
  if (error) return error;
  await prisma.release.delete({ where: { id: (await prisma.release.findFirst({ where: { OR: [{ id }, { releaseCode: id }] } }))?.id ?? id } });
  return NextResponse.json({ ok: true });
}
