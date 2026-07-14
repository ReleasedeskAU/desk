import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { patchEnvironmentSchema } from "@/lib/validation/org-patch";
import { zodErrorResponse } from "@/lib/api-errors";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = patchEnvironmentSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const row = await prisma.environment.update({
    where: { id },
    data: {
      ...(body.applicationId !== undefined ? { applicationId: body.applicationId } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.owner !== undefined ? { owner: body.owner } : {}),
      ...(body.lastDbRefresh !== undefined
        ? { lastDbRefresh: body.lastDbRefresh ? new Date(body.lastDbRefresh) : null }
        : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    },
    include: { application: true },
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("editor");
  if (error) return error;

  const [versionCount, bookingCount] = await Promise.all([
    prisma.environmentVersion.count({ where: { environmentId: id } }),
    prisma.envBooking.count({ where: { environmentId: id } }),
  ]);
  if (versionCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${versionCount} version record${versionCount === 1 ? "" : "s"} linked to this environment` },
      { status: 409 }
    );
  }
  if (bookingCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete — used by ${bookingCount} env booking${bookingCount === 1 ? "" : "s"}` },
      { status: 409 }
    );
  }

  await prisma.environment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
