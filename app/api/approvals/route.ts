import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { approvalWhere, sp } from "@/lib/list-api-filters";
import { createApprovalFromBody } from "@/lib/approval-create";

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.approval.findMany({
    where: approvalWhere(sp(req)),
    include: {
      release: { select: { id: true, releaseCode: true, name: true, status: true, releaseDate: true } },
      approver: { select: { id: true, userId: true, name: true, email: true, role: true } },
    },
    orderBy: { sourceOrder: "asc" },
  });
  return NextResponse.json(data);
}

/**
 * Creates an editor-authorized approval and derives its identity and release metadata server-side.
 * Default deny: requireRole("editor") — editors and higher only.
 */
export async function POST(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await createApprovalFromBody(user!.id, rawBody);
  if (!result.ok) return result.response;
  return NextResponse.json(result.row, { status: 201 });
}
