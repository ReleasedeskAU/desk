/**
 * Session-tenant resolution for native Scope.
 * Platform is multi-tenant — never list users or load a release without an org match.
 * Tenant comes from the session only (Clerk org, else the user's stored organizationId).
 * Fail closed: missing tenant → deny. Do not fall back to getDefaultOrganizationId or unfiltered reads.
 */

import { auth } from "@clerk/nextjs/server";
import type { SessionUser } from "@/lib/auth/roles";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resolveDirectoryUser } from "@/lib/release-directory-user";

export type ScopeTenantContext = {
  organizationId: string;
};

export type TenantReleaseLookup =
  | { ok: true; releaseId: string; tenant: ScopeTenantContext }
  | { ok: false; code: "TENANT_REQUIRED" | "NOT_FOUND" };

/**
 * Non-empty organization id, or null. Empty / whitespace is not a tenant.
 */
export function requireTenantOrganizationId(
  organizationId: string | null | undefined
): string | null {
  if (typeof organizationId !== "string") return null;
  const trimmed = organizationId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve the session tenant. Returns null when the caller must be denied.
 *
 * @param session - Authenticated session (never a client-supplied org id).
 */
export async function resolveScopeTenant(
  session: SessionUser
): Promise<ScopeTenantContext | null> {
  let clerkOrgId: string | null = null;
  try {
    const raw = (await auth()).orgId;
    clerkOrgId = requireTenantOrganizationId(raw);
  } catch (error) {
    logger.warn("scope tenant: Clerk org lookup failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  if (clerkOrgId) {
    try {
      const organization = await prisma.organization.findUnique({
        where: { clerkOrgId },
        select: { id: true },
      });
      if (!organization) {
        logger.warn("scope tenant: Clerk org is set but Organization row is missing");
        return null;
      }
      return { organizationId: organization.id };
    } catch (error) {
      logger.warn("scope tenant: Organization lookup failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
      return null;
    }
  }

  const directoryUser = await resolveDirectoryUser(session);
  if (!directoryUser) return null;

  try {
    const rows = await prisma.$queryRaw<Array<{ organizationId: string | null }>>`
      SELECT "organizationId" FROM "User" WHERE id = ${directoryUser.id} LIMIT 1
    `;
    const organizationId = requireTenantOrganizationId(rows[0]?.organizationId);
    if (!organizationId) return null;
    return { organizationId };
  } catch (error) {
    logger.warn("scope tenant: User.organizationId read failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

/**
 * Release id that exists in the session tenant. Null when missing or in another tenant (same 404).
 *
 * @param releaseIdOrCode - URL id or releaseCode.
 * @param organizationId - Session organization id.
 */
export async function findReleaseIdForTenant(
  releaseIdOrCode: string,
  organizationId: string
): Promise<string | null> {
  const orgId = requireTenantOrganizationId(organizationId);
  const key = releaseIdOrCode.trim();
  if (!orgId || !key) return null;

  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Release"
      WHERE (id = ${key} OR "releaseCode" = ${key})
        AND "organizationId" = ${orgId}
      LIMIT 1
    `;
    return requireTenantOrganizationId(rows[0]?.id);
  } catch (error) {
    logger.warn("scope tenant: tenant-scoped release lookup failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

/**
 * Load a release only when it belongs to the session tenant.
 *
 * @param releaseIdOrCode - URL id or releaseCode.
 * @param session - Authenticated session.
 */
export async function lookupReleaseForSessionTenant(
  releaseIdOrCode: string,
  session: SessionUser
): Promise<TenantReleaseLookup> {
  const tenant = await resolveScopeTenant(session);
  if (!tenant) return { ok: false, code: "TENANT_REQUIRED" };
  const releaseId = await findReleaseIdForTenant(releaseIdOrCode, tenant.organizationId);
  if (!releaseId) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, releaseId, tenant };
}

/**
 * True when the stored file tenant key is this session organization.
 *
 * @param fileTenantKey - tenantKey on ReleaseScopeFile.
 * @param organizationId - Session organization id.
 */
export function assertSameTenantFile(fileTenantKey: string, organizationId: string): boolean {
  const fileKey = requireTenantOrganizationId(fileTenantKey);
  const orgId = requireTenantOrganizationId(organizationId);
  return Boolean(fileKey && orgId && fileKey === orgId);
}
