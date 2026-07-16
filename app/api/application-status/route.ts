import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { applicationStatusWhere, sp } from "@/lib/list-api-filters";
import { zodErrorResponse } from "@/lib/api-errors";
import { createApplicationStatusSchema } from "@/lib/validation/application-status";

const statusInclude = {
  application: {
    select: { id: true, name: true, department: { select: { name: true } } },
  },
} as const;

function parseDateTime(value: string): Date | undefined {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Read-only for this pass. CURRENT STATE data — one row per
 * (application, environment), overwritten on each check, not a history log.
 */
export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.applicationStatus.findMany({
    where: applicationStatusWhere(sp(req)),
    include: statusInclude,
    orderBy: { sourceOrder: "asc" },
  });
  return NextResponse.json(data);
}

/** Upserts current application health for one application/environment pair. */
export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = createApplicationStatusSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  const lastCheck = parseDateTime(body.lastCheck);
  if (!lastCheck) {
    return NextResponse.json({ error: "Invalid lastCheck" }, { status: 400 });
  }

  const application = await prisma.application.findUnique({
    where: { id: body.applicationId },
    select: { id: true, department: { select: { name: true } } },
  });
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 400 });

  const where = {
    applicationId_environmentName: {
      applicationId: body.applicationId,
      environmentName: body.environmentName,
    },
  };

  const [existing, maxOrder] = await Promise.all([
    prisma.applicationStatus.findUnique({ where }),
    prisma.applicationStatus.aggregate({ _max: { sourceOrder: true } }),
  ]);

  const row = await prisma.applicationStatus.upsert({
    where,
    update: {
      status: body.status,
      lastCheck,
      uptimePercent: body.uptimePercent ?? null,
      notes: body.notes ?? null,
    },
    create: {
      applicationId: body.applicationId,
      environmentName: body.environmentName,
      status: body.status,
      lastCheck,
      uptimePercent: body.uptimePercent ?? null,
      notes: body.notes ?? null,
      sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
    },
    include: statusInclude,
  });

  return NextResponse.json(row, { status: existing ? 200 : 201 });
}
