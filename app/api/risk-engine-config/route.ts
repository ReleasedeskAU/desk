/**
 * GET/PUT /api/risk-engine-config — per-user Simple + Weighted threshold settings.
 * Auth: requireSession (same pattern as appearance-preferences).
 * Missing row → shipped defaults on GET (never 404/error for empty config).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/api";
import {
  normalizeRiskEngineConfig,
  validateSimpleCutoffs,
  validateWeightedCutoffs,
} from "@/lib/risk-engine-config";
import {
  loadRiskEngineConfig,
  saveRiskEngineConfig,
} from "@/lib/risk-engine-config-db";

const labelsSimple = z.object({
  low: z.string().trim().min(1).max(40),
  medium: z.string().trim().min(1).max(40),
  high: z.string().trim().min(1).max(40),
  critical: z.string().trim().min(1).max(40),
});

const cutoffsSimple = z.object({
  low: z.number().finite(),
  medium: z.number().finite(),
  high: z.number().finite(),
});

const labelsWeighted = z.object({
  low: z.string().trim().min(1).max(40),
  medium: z.string().trim().min(1).max(40),
  high: z.string().trim().min(1).max(40),
  critical: z.string().trim().min(1).max(40),
  severe: z.string().trim().min(1).max(40),
});

const cutoffsWeighted = z.object({
  low: z.number().finite(),
  medium: z.number().finite(),
  high: z.number().finite(),
  critical: z.number().finite(),
});

const putSchema = z
  .object({
    likelihoodMax: z.number().int().min(2).max(10),
    impactMax: z.number().int().min(2).max(10),
    simpleBandLabels: labelsSimple,
    simpleBandCutoffs: cutoffsSimple,
    weightedBandLabels: labelsWeighted,
    weightedBandCutoffs: cutoffsWeighted,
  })
  .strict();

/**
 * Returns the caller's risk engine config (defaults when no row exists).
 */
export async function GET() {
  const { user, error } = await requireSession();
  if (error) return error;

  const config = await loadRiskEngineConfig(user!.id);
  return NextResponse.json({ config });
}

/**
 * Upserts the caller's risk engine config.
 */
export async function PUT(req: Request) {
  const { user, error } = await requireSession();
  if (error) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid config", details: parsed.error.flatten() }, { status: 400 });
  }

  const config = normalizeRiskEngineConfig(parsed.data);
  const simpleErr = validateSimpleCutoffs(config.simpleBandCutoffs);
  if (simpleErr) return NextResponse.json({ error: simpleErr }, { status: 400 });
  const weightedErr = validateWeightedCutoffs(config.weightedBandCutoffs);
  if (weightedErr) return NextResponse.json({ error: weightedErr }, { status: 400 });

  try {
    const saved = await saveRiskEngineConfig(user!.id, config);
    return NextResponse.json({ config: saved });
  } catch (err) {
    console.error("[risk-engine-config] save failed", {
      name: err instanceof Error ? err.name : "UnknownError",
    });
    return NextResponse.json({ error: "Failed to save risk engine config" }, { status: 500 });
  }
}
