import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { incidentWhere, sp } from "@/lib/list-api-filters";
import { zodErrorResponse } from "@/lib/api-errors";
import { createIncidentSchema } from "@/lib/validation/incident";
import { loadIncidentLifecycleConfig } from "@/lib/incident-lifecycle-config-db";
import { resolveCreateLifecycleStatus } from "@/lib/entity-lifecycle-create-guard";

const incidentInclude = {
  application: { select: { id: true, name: true } },
} as const;

async function nextIncidentCode(): Promise<string> {
  const rows = await prisma.incident.findMany({ select: { incidentCode: true } });
  const next = rows.reduce((max, row) => {
    const match = row.incidentCode.match(/^INC-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  return `INC-${String(next).padStart(3, "0")}`;
}

function parseDateTime(value: string): Date | undefined {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function withRelatedRelease(row: {
  relatedReleaseCode: string | null;
  [key: string]: unknown;
}) {
  const relatedRelease = row.relatedReleaseCode
    ? await prisma.release.findUnique({
        where: { releaseCode: row.relatedReleaseCode },
        select: { id: true, releaseCode: true, name: true },
      })
    : null;
  return { ...row, relatedRelease };
}

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

export async function POST(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const parsed = createIncidentSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  const timestamp = parseDateTime(body.timestamp);
  if (!timestamp) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
  }

  const [application, release, maxOrder] = await Promise.all([
    prisma.application.findUnique({
      where: { id: body.applicationId },
      select: { id: true, department: { select: { name: true } } },
    }),
    body.relatedReleaseCode
      ? prisma.release.findUnique({
          where: { releaseCode: body.relatedReleaseCode },
          select: { id: true, releaseCode: true },
        })
      : Promise.resolve(null),
    prisma.incident.aggregate({ _max: { sourceOrder: true } }),
  ]);
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 400 });
  if (body.relatedReleaseCode && !release) {
    return NextResponse.json({ error: "Release not found" }, { status: 400 });
  }

  let status = String(body.status ?? "").trim();
  try {
    const loaded = await loadIncidentLifecycleConfig(user!.id);
    const resolved = resolveCreateLifecycleStatus(loaded.config, status, "incident");
    if (!resolved.ok) return resolved.response;
    status = resolved.status;
  } catch (err) {
    console.error("[incidents-create] lifecycle config load failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Incident lifecycle configuration is temporarily unavailable" },
      { status: 503 }
    );
  }

  const row = await prisma.incident.create({
    data: {
      incidentCode: await nextIncidentCode(),
      timestamp,
      applicationId: body.applicationId,
      departmentName: body.departmentName ?? application.department.name,
      severity: body.severity,
      title: body.title,
      status,
      impact: body.impact,
      assignedTo: body.assignedTo ?? null,
      relatedReleaseCode: body.relatedReleaseCode ?? null,
      environmentName: body.environmentName,
      sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
    },
    include: incidentInclude,
  });
  return NextResponse.json(await withRelatedRelease(row), { status: 201 });
}
