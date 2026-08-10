import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  loadRiskLifecycleConfig,
  saveRiskLifecycleConfig,
} from "@/lib/risk-lifecycle-config-db";
import {
  validateRiskLifecycleConfig,
  type RiskLifecycleConfig,
} from "@/lib/risk-lifecycle-config";

/**
 * GET the caller's risk lifecycle configuration (seeds defaults on first read).
 */
export async function GET() {
  const { user, error } = await requireRole("readonly");
  if (error) return error;
  try {
    const loaded = await loadRiskLifecycleConfig(user!.id);
    return NextResponse.json(loaded);
  } catch (err) {
    console.error("[risk-lifecycle-config] load failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to load risk lifecycle configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT replace the caller's risk lifecycle configuration.
 */
export async function PUT(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const config = (body as { config?: RiskLifecycleConfig })?.config ?? body;
  const validationError = validateRiskLifecycleConfig(
    config as RiskLifecycleConfig
  );
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  try {
    const saved = await saveRiskLifecycleConfig(
      user!.id,
      config as RiskLifecycleConfig
    );
    return NextResponse.json({ config: saved });
  } catch (err) {
    console.error("[risk-lifecycle-config] save failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to save risk lifecycle configuration" },
      { status: 500 }
    );
  }
}
