import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/api";
import { createUserRow } from "@/lib/org-compat";
import { prisma } from "@/lib/prisma";
import { userOrderBy, userWhere, sp } from "@/lib/list-api-filters";
import { zodErrorResponse } from "@/lib/api-errors";

const createUserSchema = z
  .object({
    userId: z.string().trim().max(32).optional(),
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
    role: z.string().trim().max(120).optional(),
    department: z.string().trim().max(120).optional(),
    manager: z.string().trim().max(200).nullable().optional(),
    accessLevel: z.enum(["Standard", "Admin", "Executive"]).optional(),
    status: z.enum(["Active", "Inactive"]).optional(),
  })
  .strict();

async function nextUserId() {
  const count = await prisma.user.count();
  return `USR-${String(count + 1).padStart(4, "0")}`;
}

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const data = await prisma.user.findMany({
    where: userWhere(sp(req)),
    orderBy: userOrderBy(sp(req)),
  });
  return NextResponse.json(data);
}

/** Creating users is admin-only (privilege provisioning). */
export async function POST(req: Request) {
  const { error } = await requireRole("admin");
  if (error) return error;

  const parsed = createUserSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const body = parsed.data;
  const userId = body.userId?.trim() || (await nextUserId());

  const row = await createUserRow({
    userId,
    name: body.name,
    email: body.email,
    role: body.role ?? "Developer",
    department: body.department ?? "",
    manager: body.manager ?? null,
    accessLevel: body.accessLevel ?? "Standard",
    status: body.status ?? "Active",
  });
  return NextResponse.json(row, { status: 201 });
}
