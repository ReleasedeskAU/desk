import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  loadBlockerLifecycleConfig,
  saveBlockerLifecycleConfig,
} from "@/lib/blocker-lifecycle-config-db";
import {
  validateBlockerLifecycleConfig,
  type BlockerLifecycleConfig,
} from "@/lib/blocker-lifecycle-config";

/**
 * GET the caller's blocker lifecycle configuration (seeds defaults on first read).
 */
export async function GET() {
  const { user, error } = await requireRole("readonly");
  if (error) return error;
  try {
    const loaded = await loadBlockerLifecycleConfig(user!.id);
    return NextResponse.json(loaded);
  } catch (err) {
    console.error("[blocker-lifecycle-config] load failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to load blocker lifecycle configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT replace the caller's blocker lifecycle configuration.
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
  const config = (body as { config?: BlockerLifecycleConfig })?.config ?? body;
  const validationError = validateBlockerLifecycleConfig(
    config as BlockerLifecycleConfig
  );
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  try {
    const saved = await saveBlockerLifecycleConfig(
      user!.id,
      config as BlockerLifecycleConfig
    );
    return NextResponse.json({ config: saved });
  } catch (err) {
    console.error("[blocker-lifecycle-config] save failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to save blocker lifecycle configuration" },
      { status: 500 }
    );
  }
}
