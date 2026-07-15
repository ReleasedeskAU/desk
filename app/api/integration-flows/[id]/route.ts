import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchIntegrationFlowSchema } from "@/lib/validation/integration-flow";

type Params = { params: Promise<{ id: string }> };

async function findFlow(id: string) {
  return (
    (await prisma.integrationFlow.findUnique({ where: { id } })) ??
    (await prisma.integrationFlow.findUnique({ where: { flowCode: id } }))
  );
}

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row = await findFlow(id);
  if (!row) return NextResponse.json({ error: "Integration flow not found" }, { status: 404 });
  return NextResponse.json(row);
}

/**
 * Updates allowlisted integration-flow fields. flowCode is immutable (schema.strict).
 */
export async function PATCH(req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findFlow(id);
  if (!existing) return NextResponse.json({ error: "Integration flow not found" }, { status: 404 });

  const parsed = patchIntegrationFlowSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const row = await prisma.integrationFlow.update({
    where: { id: existing.id },
    data: body,
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findFlow(id);
  if (!existing) return NextResponse.json({ error: "Integration flow not found" }, { status: 404 });

  await prisma.integrationFlow.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
