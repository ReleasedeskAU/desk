import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  loadSignoffLifecycleConfig,
  saveSignoffLifecycleConfig,
} from "@/lib/signoff-lifecycle-config-db";
import {
  validateSignoffLifecycleConfig,
  type SignoffLifecycleConfig,
} from "@/lib/signoff-lifecycle-config";

/**
 * GET the caller's sign-off lifecycle configuration (seeds defaults on first read).
 */
export async function GET() {
  const { user, error } = await requireRole("readonly");
  if (error) return error;
  try {
    const loaded = await loadSignoffLifecycleConfig(user!.id);
    return NextResponse.json(loaded);
  } catch (err) {
    console.error("[signoff-lifecycle-config] load failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to load sign-off lifecycle configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT replace the caller's sign-off lifecycle configuration.
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
  const config = (body as { config?: SignoffLifecycleConfig })?.config ?? body;
  const validationError = validateSignoffLifecycleConfig(
    config as SignoffLifecycleConfig
  );
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  try {
    const saved = await saveSignoffLifecycleConfig(
      user!.id,
      config as SignoffLifecycleConfig
    );
    return NextResponse.json({ config: saved });
  } catch (err) {
    console.error("[signoff-lifecycle-config] save failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to save sign-off lifecycle configuration" },
      { status: 500 }
    );
  }
}
