import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";

const patchUserSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(320).optional(),
    role: z.string().trim().max(120).optional(),
    department: z.string().trim().max(120).optional(),
    manager: z.string().trim().max(200).nullable().optional(),
    accessLevel: z.enum(["Standard", "Admin", "Executive"]).optional(),
    status: z.enum(["Active", "Inactive"]).optional(),
  })
  .strict();

/** Updating users is admin-only (privilege provisioning). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("admin");
  if (error) return error;

  const parsed = patchUserSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const body = parsed.data;
  const row = await prisma.user.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.department !== undefined ? { department: body.department } : {}),
      ...(body.manager !== undefined ? { manager: body.manager } : {}),
      ...(body.accessLevel !== undefined ? { accessLevel: body.accessLevel } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    },
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("admin");
  if (error) return error;

  try {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "User not found or in use" }, { status: 404 });
  }
}
