import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  loadAlertLifecycleConfig,
  saveAlertLifecycleConfig,
} from "@/lib/alert-lifecycle-config-db";
import {
  validateAlertLifecycleConfig,
  type AlertLifecycleConfig,
} from "@/lib/alert-lifecycle-config";

/**
 * GET the caller's alert lifecycle configuration (seeds defaults on first read).
 */
export async function GET() {
  const { user, error } = await requireRole("readonly");
  if (error) return error;
  try {
    const loaded = await loadAlertLifecycleConfig(user!.id);
    return NextResponse.json(loaded);
  } catch (err) {
    console.error("[alert-lifecycle-config] load failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to load alert lifecycle configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT replace the caller's alert lifecycle configuration.
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
  const config = (body as { config?: AlertLifecycleConfig })?.config ?? body;
  const validationError = validateAlertLifecycleConfig(
    config as AlertLifecycleConfig
  );
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  try {
    const saved = await saveAlertLifecycleConfig(
      user!.id,
      config as AlertLifecycleConfig
    );
    return NextResponse.json({ config: saved });
  } catch (err) {
    console.error("[alert-lifecycle-config] save failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to save alert lifecycle configuration" },
      { status: 500 }
    );
  }
}
