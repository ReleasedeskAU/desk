import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { riskWhere, sp } from "@/lib/list-api-filters";
import { zodErrorResponse } from "@/lib/api-errors";
import { createRiskRow } from "@/lib/org-compat";
import { loadRiskLifecycleConfig } from "@/lib/risk-lifecycle-config-db";
import { resolveCreateLifecycleStatus } from "@/lib/entity-lifecycle-create-guard";

async function nextRiskCode(): Promise<string> {
  const rows = await prisma.risk.findMany({ select: { riskCode: true } });
  const next = rows.reduce((max, row) => {
    const match = row.riskCode.match(/^RSK-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  return `RSK-${String(next).padStart(3, "0")}`;
}

export async function GET(req: Request) {
  const { user, error } = await requireRole("readonly");
  if (error) return error;

  const params = sp(req);
  const bandId = params.get("band")?.trim();
  let bandScoreRange: { gte: number; lte: number } | undefined;
  if (bandId && user?.id) {
    const { loadRiskEngineConfig } = await import("@/lib/risk-engine-config-db");
    const { simpleBandNumericRanges } = await import("@/lib/risk-engine-config");
    const riskConfig = await loadRiskEngineConfig(user.id);
    bandScoreRange = simpleBandNumericRanges(riskConfig)[bandId];
  }

  const data = await prisma.risk.findMany({
    where: riskWhere(params, { bandScoreRange }),
    include: {
      release: {
        select: {
          id: true,
          releaseCode: true,
          name: true,
          status: true,
          startDate: true,
          releaseDate: true,
        },
      },
      riskOwner: { select: { id: true, userId: true, name: true, email: true } },
    },
    orderBy: { sourceOrder: "asc" },
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const { loadRiskEngineConfig } = await import("@/lib/risk-engine-config-db");
  const { createRiskSchemaForScale } = await import("@/lib/validation/risk");
  const riskConfig = await loadRiskEngineConfig(user!.id);
  const parsed = createRiskSchemaForScale(
    riskConfig.likelihoodMax,
    riskConfig.impactMax
  ).safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const body = parsed.data;
  const { likelihood, impact } = body;
  const [release, application, owner, maxOrder] = await Promise.all([
    prisma.release.findUnique({
      where: { id: body.releaseId },
      select: {
        id: true,
        department: { select: { id: true, name: true } },
        applications: { where: { applicationId: body.applicationId }, select: { applicationId: true } },
      },
    }),
    prisma.application.findUnique({
      where: { id: body.applicationId },
      select: { id: true, name: true, department: { select: { id: true, name: true } } },
    }),
    body.riskOwnerId
      ? prisma.user.findUnique({ where: { id: body.riskOwnerId }, select: { id: true } })
      : Promise.resolve(null),
    prisma.risk.aggregate({ _max: { sourceOrder: true } }),
  ]);
  if (!release) return NextResponse.json({ error: "Release not found" }, { status: 400 });
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 400 });
  if (!release.applications.length) {
    return NextResponse.json({ error: "Application is not linked to the selected release" }, { status: 400 });
  }
  if (application.department.id !== release.department.id) {
    return NextResponse.json({ error: "Application and release must belong to the same department" }, { status: 400 });
  }
  if (body.riskOwnerId && !owner) {
    return NextResponse.json({ error: "Risk owner not found" }, { status: 400 });
  }

  let status = String(body.status ?? "").trim();
  let statusKey: string | undefined;
  try {
    const loaded = await loadRiskLifecycleConfig(user!.id);
    const resolved = resolveCreateLifecycleStatus(loaded.config, status, "risk");
    if (!resolved.ok) return resolved.response;
    status = resolved.status;
    statusKey = resolved.statusKey;
  } catch (err) {
    console.error("[risks-create] lifecycle config load failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Risk lifecycle configuration is temporarily unavailable" },
      { status: 503 }
    );
  }

  const row = await createRiskRow({
    riskCode: await nextRiskCode(),
    releaseId: body.releaseId,
    applicationName: application.name,
    departmentName: application.department.name,
    category: body.category,
    description: body.description,
    likelihood,
    impact,
    affectedArea: body.affectedArea ?? null,
    mitigationStrategy: body.mitigationStrategy ?? null,
    riskOwnerId: body.riskOwnerId ?? null,
    status,
    statusKey,
    notes: body.notes ?? null,
    sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
  });
  return NextResponse.json(row, { status: 201 });
}
