import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  loadDriftLifecycleConfig,
  saveDriftLifecycleConfig,
} from "@/lib/drift-lifecycle-config-db";
import {
  validateDriftLifecycleConfig,
  type DriftLifecycleConfig,
} from "@/lib/drift-lifecycle-config";

/**
 * GET the caller's drift lifecycle configuration (seeds defaults on first read).
 */
export async function GET() {
  const { user, error } = await requireRole("readonly");
  if (error) return error;
  try {
    const loaded = await loadDriftLifecycleConfig(user!.id);
    return NextResponse.json(loaded);
  } catch (err) {
    console.error("[drift-lifecycle-config] load failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to load drift lifecycle configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT replace the caller's drift lifecycle configuration.
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
  const config = (body as { config?: DriftLifecycleConfig })?.config ?? body;
  const validationError = validateDriftLifecycleConfig(
    config as DriftLifecycleConfig
  );
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  try {
    const saved = await saveDriftLifecycleConfig(
      user!.id,
      config as DriftLifecycleConfig
    );
    return NextResponse.json({ config: saved });
  } catch (err) {
    console.error("[drift-lifecycle-config] save failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to save drift lifecycle configuration" },
      { status: 500 }
    );
  }
}
