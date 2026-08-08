import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  loadDependencyLifecycleConfig,
  saveDependencyLifecycleConfig,
} from "@/lib/dependency-lifecycle-config-db";
import {
  validateDependencyLifecycleConfig,
  type DependencyLifecycleConfig,
} from "@/lib/dependency-lifecycle-config";

/**
 * GET the caller's dependency lifecycle configuration (seeds defaults on first read).
 */
export async function GET() {
  const { user, error } = await requireRole("readonly");
  if (error) return error;
  try {
    const loaded = await loadDependencyLifecycleConfig(user!.id);
    return NextResponse.json(loaded);
  } catch (err) {
    console.error("[dependency-lifecycle-config] load failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to load dependency lifecycle configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT replace the caller's dependency lifecycle configuration.
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
  const config = (body as { config?: DependencyLifecycleConfig })?.config ?? body;
  const validationError = validateDependencyLifecycleConfig(
    config as DependencyLifecycleConfig
  );
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  try {
    const saved = await saveDependencyLifecycleConfig(
      user!.id,
      config as DependencyLifecycleConfig
    );
    return NextResponse.json({ config: saved });
  } catch (err) {
    console.error("[dependency-lifecycle-config] save failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to save dependency lifecycle configuration" },
      { status: 500 }
    );
  }
}
