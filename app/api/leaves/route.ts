import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { leaveWhere, sp } from "@/lib/list-api-filters";
import { zodErrorResponse } from "@/lib/api-errors";
import { createLeaveSchema } from "@/lib/validation/leave";
import { createLeaveRow } from "@/lib/org-compat";

async function nextLeaveCode(): Promise<string> {
  const rows = await prisma.leaveRecord.findMany({ select: { leaveCode: true } });
  const max = rows.reduce((current, row) => {
    const match = /^LV-(\d+)$/i.exec(row.leaveCode);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `LV-${String(max + 1).padStart(3, "0")}`;
}

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.leaveRecord.findMany({
    where: leaveWhere(sp(req)),
    include: {
      user: { select: { id: true, userId: true, name: true, role: true, department: true } },
      affectedReleases: {
        include: {
          release: { select: { id: true, releaseCode: true, name: true, status: true, releaseDate: true } },
        },
      },
    },
    orderBy: { sourceOrder: "asc" },
  });
  return NextResponse.json(data);
}

/** Creates an editor-authorized leave record with validated release links and a generated identity. */
export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = createLeaveSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  const [user, releaseCount, maxOrder] = await Promise.all([
    prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } }),
    body.releaseIds?.length
      ? prisma.release.count({ where: { id: { in: [...new Set(body.releaseIds)] } } })
      : Promise.resolve(0),
    prisma.leaveRecord.aggregate({ _max: { sourceOrder: true } }),
  ]);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const releaseIds = [...new Set(body.releaseIds ?? [])];
  if (releaseCount !== releaseIds.length) {
    return NextResponse.json({ error: "One or more affected releases were not found" }, { status: 404 });
  }

  const row = await createLeaveRow({
    leaveCode: await nextLeaveCode(),
    userId: body.userId,
    leaveStart: new Date(body.leaveStart),
    leaveEnd: new Date(body.leaveEnd),
    leaveType: body.leaveType,
    days: body.days,
    riskImpact: body.riskImpact ?? null,
    riskScore: body.riskScore ?? 0,
    sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
    releaseIds,
  });
  return NextResponse.json(row, { status: 201 });
}
