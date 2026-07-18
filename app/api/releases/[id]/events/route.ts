import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { auditActorName } from "@/lib/release-audit";
import { prisma } from "@/lib/prisma";

/**
 * List audit events for a release (by UUID or releaseCode).
 *
 * @returns JSON array of releaseAuditEvent rows, newest first.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("readonly");
  if (error) return error;

  const release = await prisma.release.findFirst({
    where: { OR: [{ id }, { releaseCode: id }] },
    select: { id: true },
  });
  if (!release) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const events = await prisma.releaseAuditEvent.findMany({
    where: { releaseId: release.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(events);
}

/**
 * Append an audit event (note / decision / etc.) attributed to the current user.
 * Decision actions also update the release.decision field.
 *
 * @returns Created audit event (201).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const release = await prisma.release.findFirst({
    where: { OR: [{ id }, { releaseCode: id }] },
    select: { id: true },
  });
  if (!release) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const action = typeof body.action === "string" && body.action.trim() ? body.action.trim() : "note";
  const detail = typeof body.detail === "string" ? body.detail : null;

  const event = await prisma.releaseAuditEvent.create({
    data: {
      releaseId: release.id,
      action,
      actor: auditActorName(user!),
      detail,
    },
  });

  if (action === "decision" && detail) {
    const decision = detail.startsWith("Go") ? "Go" : detail.startsWith("No") ? "No-Go" : detail;
    await prisma.release.update({ where: { id: release.id }, data: { decision } });
  }

  return NextResponse.json(event, { status: 201 });
}
