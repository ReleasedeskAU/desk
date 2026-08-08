import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  loadApprovalLifecycleConfig,
  saveApprovalLifecycleConfig,
} from "@/lib/approval-lifecycle-config-db";
import {
  validateApprovalLifecycleConfig,
  type ApprovalLifecycleConfig,
} from "@/lib/approval-lifecycle-config";

/**
 * GET the caller's approval lifecycle configuration (seeds defaults on first read).
 */
export async function GET() {
  const { user, error } = await requireRole("readonly");
  if (error) return error;
  try {
    const loaded = await loadApprovalLifecycleConfig(user!.id);
    return NextResponse.json(loaded);
  } catch (err) {
    console.error("[approval-lifecycle-config] load failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to load approval lifecycle configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT replace the caller's approval lifecycle configuration.
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
  const config = (body as { config?: ApprovalLifecycleConfig })?.config ?? body;
  const validationError = validateApprovalLifecycleConfig(
    config as ApprovalLifecycleConfig
  );
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  try {
    const saved = await saveApprovalLifecycleConfig(
      user!.id,
      config as ApprovalLifecycleConfig
    );
    return NextResponse.json({ config: saved });
  } catch (err) {
    console.error("[approval-lifecycle-config] save failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to save approval lifecycle configuration" },
      { status: 500 }
    );
  }
}
