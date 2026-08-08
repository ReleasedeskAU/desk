import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  loadConflictLifecycleConfig,
  saveConflictLifecycleConfig,
} from "@/lib/conflict-lifecycle-config-db";
import {
  validateConflictLifecycleConfig,
  type ConflictLifecycleConfig,
} from "@/lib/conflict-lifecycle-config";

/**
 * GET the caller's conflict lifecycle configuration (seeds defaults on first read).
 */
export async function GET() {
  const { user, error } = await requireRole("readonly");
  if (error) return error;
  try {
    const loaded = await loadConflictLifecycleConfig(user!.id);
    return NextResponse.json(loaded);
  } catch (err) {
    console.error("[conflict-lifecycle-config] load failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to load conflict lifecycle configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT replace the caller's conflict lifecycle configuration.
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
  const config = (body as { config?: ConflictLifecycleConfig })?.config ?? body;
  const validationError = validateConflictLifecycleConfig(
    config as ConflictLifecycleConfig
  );
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  try {
    const saved = await saveConflictLifecycleConfig(
      user!.id,
      config as ConflictLifecycleConfig
    );
    return NextResponse.json({ config: saved });
  } catch (err) {
    console.error("[conflict-lifecycle-config] save failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to save conflict lifecycle configuration" },
      { status: 500 }
    );
  }
}
