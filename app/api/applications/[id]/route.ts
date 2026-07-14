import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { patchApplicationSchema } from "@/lib/validation/org-patch";
import { zodErrorResponse } from "@/lib/api-errors";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = patchApplicationSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const row = await prisma.application.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.departmentId !== undefined ? { departmentId: body.departmentId } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.productOwner !== undefined ? { productOwner: body.productOwner } : {}),
      ...(body.techLead !== undefined ? { techLead: body.techLead } : {}),
      ...(body.support !== undefined ? { support: body.support } : {}),
      ...(body.criticality !== undefined ? { criticality: body.criticality } : {}),
    },
    include: { department: true },
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("editor");
  if (error) return error;

  const [releaseCount, bookingCount] = await Promise.all([
    prisma.releaseApplication.count({ where: { applicationId: id } }),
    prisma.envBooking.count({ where: { applicationId: id } }),
  ]);
  if (releaseCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete — used by ${releaseCount} release${releaseCount === 1 ? "" : "s"}` },
      { status: 409 }
    );
  }
  if (bookingCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete — used by ${bookingCount} env booking${bookingCount === 1 ? "" : "s"}` },
      { status: 409 }
    );
  }

  await prisma.application.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
