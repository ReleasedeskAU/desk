import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

/**
 * PATCH RiskFactor catalog metadata (weight/name/active).
 *
 * DEFERRED (separate ticket — do not lose): editing weight/active here does NOT
 * call computeWeightedRiskScore() for releases that use this factor. Catalog
 * edits currently leave Release.weightedRiskScore stale until the standalone
 * seed-risk-factors script (or a future recompute API) runs.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("editor");
  if (error) return error;

  const body = await req.json();
  const weight = body.weight !== undefined ? Number(body.weight) : undefined;
  if (weight !== undefined && (Number.isNaN(weight) || weight <= 0)) {
    return NextResponse.json({ error: "Weight must be a positive number" }, { status: 400 });
  }

  const row = await prisma.riskFactor.update({
    where: { id },
    data: {
      category: body.category,
      factorName: body.factorName,
      weight,
      description: body.description,
      active: body.active,
      order: body.order,
    },
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("editor");
  if (error) return error;

  const inputCount = await prisma.releaseRiskFactorInput.count({ where: { riskFactorId: id } });
  if (inputCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${inputCount} release input${inputCount === 1 ? "" : "s"} reference this factor` },
      { status: 409 }
    );
  }

  await prisma.riskFactor.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
