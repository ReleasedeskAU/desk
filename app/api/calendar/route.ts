import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { calendarEventWhere, sp } from "@/lib/list-api-filters";
import { zodErrorResponse } from "@/lib/api-errors";
import { createCalendarEventSchema } from "@/lib/validation/calendar";

const calendarInclude = {
  release: {
    select: {
      releaseCode: true,
      status: true,
      name: true,
    },
  },
} as const;

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.calendarEvent.findMany({
    where: calendarEventWhere(sp(req)),
    include: calendarInclude,
    orderBy: { sourceOrder: "asc" },
  });

  return NextResponse.json(data);
}

/** Creates an editor-authorized calendar entry with optional release link. */
export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = createCalendarEventSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  if (body.releaseId) {
    const release = await prisma.release.findUnique({
      where: { id: body.releaseId },
      select: { id: true },
    });
    if (!release) {
      return NextResponse.json({ error: "Linked release was not found" }, { status: 404 });
    }
  }

  const maxOrder = await prisma.calendarEvent.aggregate({ _max: { sourceOrder: true } });
  const created = await prisma.calendarEvent.create({
    data: {
      date: new Date(body.date),
      eventType: body.eventType,
      title: body.title,
      releaseId: body.releaseId ?? null,
      applicationName: body.applicationName ?? null,
      departmentName: body.departmentName ?? null,
      sizeImpact: body.sizeImpact ?? null,
      notes: body.notes ?? null,
      sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
    },
    include: calendarInclude,
  });

  return NextResponse.json(created, { status: 201 });
}
