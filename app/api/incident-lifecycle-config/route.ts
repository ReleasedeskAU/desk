import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  loadIncidentLifecycleConfig,
  saveIncidentLifecycleConfig,
} from "@/lib/incident-lifecycle-config-db";
import {
  validateIncidentLifecycleConfig,
  type IncidentLifecycleConfig,
} from "@/lib/incident-lifecycle-config";

/**
 * GET the caller's incident lifecycle configuration (seeds defaults on first read).
 */
export async function GET() {
  const { user, error } = await requireRole("readonly");
  if (error) return error;
  try {
    const loaded = await loadIncidentLifecycleConfig(user!.id);
    return NextResponse.json(loaded);
  } catch (err) {
    console.error("[incident-lifecycle-config] load failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to load incident lifecycle configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT replace the caller's incident lifecycle configuration.
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
  const config = (body as { config?: IncidentLifecycleConfig })?.config ?? body;
  const validationError = validateIncidentLifecycleConfig(
    config as IncidentLifecycleConfig
  );
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  try {
    const saved = await saveIncidentLifecycleConfig(
      user!.id,
      config as IncidentLifecycleConfig
    );
    return NextResponse.json({ config: saved });
  } catch (err) {
    console.error("[incident-lifecycle-config] save failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to save incident lifecycle configuration" },
      { status: 500 }
    );
  }
}
