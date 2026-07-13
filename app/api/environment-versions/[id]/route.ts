import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row =
    (await prisma.environmentVersion.findUnique({
      where: { id },
      include: {
        application: { include: { department: { select: { name: true } } } },
        environment: { select: { id: true, name: true, type: true } },
      },
    })) ??
    (await prisma.environmentVersion.findFirst({
      where: { appCode: id },
      include: {
        application: { include: { department: { select: { name: true } } } },
        environment: { select: { id: true, name: true, type: true } },
      },
    }));

  if (!row) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  return NextResponse.json(row);
}
