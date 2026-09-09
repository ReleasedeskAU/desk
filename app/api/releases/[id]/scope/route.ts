import { NextResponse } from "next/server";
import { handlePatchScope } from "@/lib/release-scope-routes";
import {
  buildScopeCapabilities,
  toScopeClientPayload,
} from "@/lib/release-scope-service";
import { loadScopeRouteContext } from "@/lib/release-scope-http";

/**
 * Read native scope (ensures the draft row exists).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadScopeRouteContext(id);
  if (!ctx.ok) return ctx.response;
  const capabilities = buildScopeCapabilities(ctx.decision, ctx.scope);
  return NextResponse.json({
    scope: toScopeClientPayload(ctx.scope, ctx.release.scopeDescription, ctx.config, capabilities),
    capabilities,
  });
}

/**
 * Draft scope description / due date. Not the Release PATCH (no VR-21).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePatchScope(req, id);
}
