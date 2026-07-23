/**
 * GET/PUT /api/risk-engine-config — per-user Simple + Weighted threshold settings.
 * Auth: requireSession (same pattern as appearance-preferences).
 * Missing row → shipped defaults on GET (never 404/error for empty config).
 * Simple bands: ordered list of 3–6 { id, label, maxScore } (last maxScore null).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/api";
import {
  MAX_SIMPLE_BANDS,
  MIN_SIMPLE_BANDS,
  normalizeRiskEngineConfig,
  validateSimpleBands,
  validateWeightedCutoffs,
} from "@/lib/risk-engine-config";
import {
  loadRiskEngineConfig,
  saveRiskEngineConfig,
} from "@/lib/risk-engine-config-db";

const simpleBandSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(40),
  maxScore: z.union([z.coerce.number().finite(), z.null()]),
});

const labelsWeighted = z.object({
  low: z.string().trim().min(1).max(40),
  medium: z.string().trim().min(1).max(40),
  high: z.string().trim().min(1).max(40),
  critical: z.string().trim().min(1).max(40),
  severe: z.string().trim().min(1).max(40),
});

const putSchema = z
  .object({
    likelihoodMax: z.coerce.number().int().min(2).max(10),
    impactMax: z.coerce.number().int().min(2).max(10),
    simpleBands: z.array(simpleBandSchema).min(MIN_SIMPLE_BANDS).max(MAX_SIMPLE_BANDS),
    weightedBandLabels: labelsWeighted,
    weightedBandCutoffs: z.object({
      low: z.coerce.number().finite(),
      medium: z.coerce.number().finite(),
      high: z.coerce.number().finite(),
      critical: z.coerce.number().finite(),
    }),
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
  const simpleErr = validateSimpleBands(config.simpleBands);
  if (simpleErr) return NextResponse.json({ error: simpleErr }, { status: 400 });
  const weightedErr = validateWeightedCutoffs(config.weightedBandCutoffs);
  if (weightedErr) return NextResponse.json({ error: weightedErr }, { status: 400 });

  try {
    const saved = await saveRiskEngineConfig(user!.id, config);
    return NextResponse.json({ config: saved });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code ?? "")
        : "";
    const message = err instanceof Error ? err.message : "UnknownError";
    console.error("[risk-engine-config] save failed", { code, name: message.slice(0, 120) });

    if (code === "P2021" || /does not exist|userRiskEngineConfig/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Risk engine settings table is missing on this database. Run migrations (node scripts/run-db-migrate.mjs) against the DATABASE_URL used by this Vercel deployment, then retry Save.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Failed to save risk engine config"
            : `Failed to save risk engine config: ${message.slice(0, 180)}`,
      },
      { status: 500 }
    );
  }
}
