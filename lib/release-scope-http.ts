/**
 * Shared loaders for native scope routes. Default deny; tenant from session.
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api";
import type { SessionUser } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { resolveDirectoryUser } from "@/lib/release-directory-user";
import { resolveLifecycleConfigForRelease } from "@/lib/release-lifecycle-config-db";
import {
  actorSnapshot,
  buildScopeCapabilities,
  ensureReleaseScope,
  releaseScopeWritesLocked,
  seatsForRelease,
  type LoadedScope,
} from "@/lib/release-scope-service";
import { loadScopeSectionConfig } from "@/lib/release-scope-config-db";
import {
  lookupReleaseForSessionTenant,
  type ScopeTenantContext,
} from "@/lib/release-scope-tenant";
import type { DirectoryUserRef } from "@/lib/release-seats";
import type { SeatDecision } from "@/lib/release-seats";
import type { ScopeSectionConfig } from "@/lib/release-scope-status";

export type LoadedReleaseForScope = {
  id: string;
  status: string;
  scopeDescription: string | null;
  releaseOwnerId: string | null;
  releaseManagerId: string | null;
  lifecycleConfigVersionId: string | null;
  cabScopeSnapshot: unknown;
};

/**
 * Authenticate and load the release + seat decision + scope.
 *
 * @param idParam - URL id (uuid or releaseCode).
 */
export async function loadScopeRouteContext(idParam: string): Promise<
  | {
      ok: true;
      user: SessionUser;
      directoryUser: DirectoryUserRef | null;
      release: LoadedReleaseForScope;
      scope: LoadedScope;
      decision: SeatDecision;
      config: ScopeSectionConfig;
      tenant: ScopeTenantContext;
    }
  | { ok: false; response: NextResponse }
> {
  const { user, error } = await requireSession();
  if (error || !user) {
    return { ok: false, response: error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const looked = await lookupReleaseForSessionTenant(idParam, user);
  if (!looked.ok) {
    return { ok: false, response: tenantReleaseLookupError(looked)! };
  }

  const release = await prisma.release.findUnique({
    where: { id: looked.releaseId },
    select: {
      id: true,
      status: true,
      scopeDescription: true,
      releaseOwnerId: true,
      releaseManagerId: true,
      lifecycleConfigVersionId: true,
      cabScopeSnapshot: true,
    },
  });
  if (!release) {
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  let writeLocked = false;
  try {
    const { config } = await resolveLifecycleConfigForRelease(
      user.id,
      release.lifecycleConfigVersionId
    );
    writeLocked = releaseScopeWritesLocked(config, release.status);
  } catch (err) {
    console.error("[scope] lifecycle resolve failed", {
      releaseId: release.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Release policy is temporarily unavailable" },
        { status: 500 }
      ),
    };
  }

  const directoryUser = await resolveDirectoryUser(user);
  const decision = seatsForRelease({
    session: user,
    directoryUser,
    releaseOwnerId: release.releaseOwnerId,
    releaseManagerId: release.releaseManagerId,
    writeLocked,
  });
  const scope = await ensureReleaseScope(release.id);
  const config = await loadScopeSectionConfig(user.id);
  return { ok: true, user, directoryUser, release, scope, decision, config, tenant: looked.tenant };
}

/**
 * Actor snapshot for this request (written once from session).
 */
export function routeActor(
  user: SessionUser,
  directoryUser: DirectoryUserRef | null
) {
  return actorSnapshot(user, directoryUser?.id ?? null);
}

/**
 * JSON error used by scope routes (no internals).
 */
export function scopeDenied(
  status: number,
  error: string,
  code: string
): NextResponse {
  return NextResponse.json({ error, code }, { status });
}

/**
 * HTTP response for a failed tenant-scoped release lookup. Null when the lookup succeeded.
 */
export function tenantReleaseLookupError(
  looked: { ok: true } | { ok: false; code: "TENANT_REQUIRED" | "NOT_FOUND" }
): NextResponse | null {
  if (looked.ok) return null;
  if (looked.code === "TENANT_REQUIRED") {
    return NextResponse.json({ error: "Tenant required", code: "TENANT_REQUIRED" }, { status: 403 });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export { buildScopeCapabilities };
