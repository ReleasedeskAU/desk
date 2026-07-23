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
    weightedRiskEnabled: z.boolean(),
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
  // #region agent log
  fetch("http://127.0.0.1:7344/ingest/492950fb-2790-4cbd-9ede-c2d15d57b4c6", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "496e00" },
    body: JSON.stringify({
      sessionId: "496e00",
      runId: "pre-fix",
      hypothesisId: "H3",
      location: "api/risk-engine-config/route.ts:GET",
      message: "GET loaded config",
      data: {
        bands: config.simpleBands.map((b) => ({
          id: b.id,
          label: b.label,
          maxScore: b.maxScore,
        })),
        likelihoodMax: config.likelihoodMax,
        impactMax: config.impactMax,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
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

  // Validate incoming bands BEFORE normalize — normalize fail-opens to defaults and would
  // silently overwrite custom labels/cutoffs on a bad payload (security/correctness).
  const incomingBands = parsed.data.simpleBands.map((b) => ({
    id: b.id,
    label: b.label,
    maxScore: b.maxScore,
  }));
  const preNormErr = validateSimpleBands(incomingBands);
  if (preNormErr) {
    // #region agent log
    fetch("http://127.0.0.1:7344/ingest/492950fb-2790-4cbd-9ede-c2d15d57b4c6", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "496e00" },
      body: JSON.stringify({
        sessionId: "496e00",
        runId: "post-fix",
        hypothesisId: "H2",
        location: "api/risk-engine-config/route.ts:PUT:reject",
        message: "PUT rejected invalid bands before normalize",
        data: { preNormErr, incomingBands },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return NextResponse.json({ error: preNormErr }, { status: 400 });
  }
  const weightedPreErr = validateWeightedCutoffs(parsed.data.weightedBandCutoffs);
  if (weightedPreErr) {
    return NextResponse.json({ error: weightedPreErr }, { status: 400 });
  }

  const config = normalizeRiskEngineConfig(parsed.data);
  // #region agent log
  fetch("http://127.0.0.1:7344/ingest/492950fb-2790-4cbd-9ede-c2d15d57b4c6", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "496e00" },
    body: JSON.stringify({
      sessionId: "496e00",
      runId: "post-fix",
      hypothesisId: "H2",
      location: "api/risk-engine-config/route.ts:PUT",
      message: "PUT normalize check",
      data: {
        incomingBands,
        normalizedBands: config.simpleBands.map((b) => ({
          id: b.id,
          label: b.label,
          maxScore: b.maxScore,
        })),
        preNormErr: preNormErr ?? null,
        wipedToDefaults:
          incomingBands.map((b) => b.label).join("|") !==
          config.simpleBands.map((b) => b.label).join("|"),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const simpleErr = validateSimpleBands(config.simpleBands);
  if (simpleErr) return NextResponse.json({ error: simpleErr }, { status: 400 });
  const weightedErr = validateWeightedCutoffs(config.weightedBandCutoffs);
  if (weightedErr) return NextResponse.json({ error: weightedErr }, { status: 400 });

  try {
    const saved = await saveRiskEngineConfig(user!.id, config);
    // #region agent log
    fetch("http://127.0.0.1:7344/ingest/492950fb-2790-4cbd-9ede-c2d15d57b4c6", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "496e00" },
      body: JSON.stringify({
        sessionId: "496e00",
        runId: "post-fix",
        hypothesisId: "H2",
        location: "api/risk-engine-config/route.ts:PUT:saved",
        message: "PUT persisted config",
        data: {
          savedBands: saved.simpleBands.map((b) => ({
            id: b.id,
            label: b.label,
            maxScore: b.maxScore,
          })),
          likelihoodMax: saved.likelihoodMax,
          impactMax: saved.impactMax,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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
