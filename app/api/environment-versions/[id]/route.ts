import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchEnvironmentVersionSchema } from "@/lib/validation/environment-version";

type Params = { params: Promise<{ id: string }> };

const versionInclude = {
  application: { include: { department: { select: { name: true } } } },
  environment: { select: { id: true, name: true, type: true } },
} as const;

async function findVersion(id: string) {
  return (
    (await prisma.environmentVersion.findUnique({ where: { id }, include: versionInclude })) ??
    (await prisma.environmentVersion.findFirst({ where: { appCode: id }, include: versionInclude }))
  );
}

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Stage order for Dev → Test → UAT → Pre-Prod → Prod progression visual. */
function stageRank(name: string, type: string): number {
  const n = `${name} ${type}`.toLowerCase();
  if (/\bdev\b|development/.test(n)) return 0;
  if (/\btest\b|qa\b/.test(n) && !/uat|pre-?prod|preprod/.test(n)) return 1;
  if (/\buat\b/.test(n)) return 2;
  if (/pre-?prod|preprod|staging/.test(n)) return 3;
  if (/\bprod\b|production/.test(n)) return 4;
  return 50;
}

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row = await findVersion(id);
  if (!row) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const siblings = await prisma.environmentVersion.findMany({
    where: { applicationId: row.applicationId },
    include: { environment: { select: { id: true, name: true, type: true } } },
    orderBy: { deployDate: "desc" },
  });

  const progression = [...siblings]
    .sort(
      (a, b) =>
        stageRank(a.environment.name, a.environment.type) -
        stageRank(b.environment.name, b.environment.type)
    )
    .map((s) => ({
      id: s.id,
      version: s.version,
      status: s.status,
      deployDate: s.deployDate,
      environment: s.environment,
      isCurrent: s.id === row.id,
    }));

  return NextResponse.json({ ...row, siblings: progression });
}

/**
 * Updates allowlisted version fields. id/appCode identity fields are immutable.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findVersion(id);
  if (!existing) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const parsed = patchEnvironmentVersionSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const deployDate = parseDate(body.deployDate);
  if (body.deployDate !== undefined && body.deployDate !== null && deployDate === undefined) {
    return NextResponse.json({ error: "Invalid deployDate" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.version !== undefined) data.version = body.version;
  if (body.buildNumber !== undefined) data.buildNumber = body.buildNumber;
  if (deployDate !== undefined) data.deployDate = deployDate;
  if (body.updatedBy !== undefined) data.updatedBy = body.updatedBy;
  if (body.status !== undefined) data.status = body.status;
  if (body.notes !== undefined) data.notes = body.notes;

  const row = await prisma.environmentVersion.update({
    where: { id: existing.id },
    data,
    include: versionInclude,
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findVersion(id);
  if (!existing) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  await prisma.environmentVersion.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
