/**
 * GET /api/releases/[id]/services — live Services Involved for a release.
 * Computed via Service.applicationId → Application → ReleaseApplication.
 * Auth: readonly+. Never stores a denormalized list on Release.
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { listServicesForRelease } from "@/lib/copilot/release-services";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await requireRole("readonly");
  if (error) return error;

  const release = await prisma.release.findFirst({
    where: { OR: [{ id }, { releaseCode: id }] },
    select: { id: true },
  });
  if (!release) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const services = await listServicesForRelease(release.id);
  return NextResponse.json({ services });
}
