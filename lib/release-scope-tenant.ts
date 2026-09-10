/**
 * Session-tenant resolution for native Scope.
 * Platform is multi-tenant — a different non-null organizationId is another tenant.
 *
 * GET /api/releases (list) is not org-filtered. Detail must load those same rows:
 * matching session org, or a null organizationId (legacy / preview). Do not use
 * getDefaultOrganizationId. Clerk org is identity; User.organizationId is the
 * data-plane tenant stamped on User/Release rows.
 */

import { auth } from "@clerk/nextjs/server";
import type { SessionUser } from "@/lib/auth/roles";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resolveDirectoryUser } from "@/lib/release-directory-user";

export type ScopeTenantContext = {
  /** Session data-plane org, or null when the workspace is unscoped (NULL org columns). */
  organizationId: string | null;
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
 * Whether a release the list already showed is loadable for this session.
 * Null row org = unscoped (list is not org-filtered). A different non-null org is another tenant.
 *
 * @param releaseOrganizationId - organizationId on the Release row (may be null).
 * @param sessionOrganizationId - Session data-plane org (may be null).
 */
export function releaseRowVisibleToSessionTenant(
  releaseOrganizationId: string | null | undefined,
  sessionOrganizationId: string | null | undefined
): boolean {
  const rowOrg = requireTenantOrganizationId(releaseOrganizationId);
  const sessionOrg = requireTenantOrganizationId(sessionOrganizationId);
  if (rowOrg && sessionOrg) return rowOrg === sessionOrg;
  if (rowOrg && !sessionOrg) return false;
  return true;
}

async function readUserOrganizationId(userId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ organizationId: string | null }>>`
      SELECT "organizationId" FROM "User" WHERE id = ${userId} LIMIT 1
    `;
    return requireTenantOrganizationId(rows[0]?.organizationId);
  } catch (error) {
    logger.warn("scope tenant: User.organizationId read failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

/**
 * Resolve the session data-plane tenant. Directory User.organizationId first
 * (same stamp as Release rows). Clerk org only when the user row has no org.
 *
 * @param session - Authenticated session (never a client-supplied org id).
 */
export async function resolveScopeTenant(
  session: SessionUser
): Promise<ScopeTenantContext | null> {
  const directoryUser = await resolveDirectoryUser(session);
  if (directoryUser) {
    const userOrg = await readUserOrganizationId(directoryUser.id);
    if (userOrg) return { organizationId: userOrg };
  }

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
      if (organization) return { organizationId: organization.id };
      logger.warn("scope tenant: Clerk org is set but Organization row is missing");
    } catch (error) {
      logger.warn("scope tenant: Organization lookup failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return null;
}

type ReleaseOrgRow = { id: string; organizationId: string | null };

/**
 * Release id + stored org for an id or releaseCode (same match as the list GET).
 */
export async function findReleaseIdAndOrganization(
  releaseIdOrCode: string
): Promise<ReleaseOrgRow | null> {
  const key = releaseIdOrCode.trim();
  if (!key) return null;

  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; organizationId: string | null }>>`
      SELECT id, "organizationId" FROM "Release"
      WHERE id = ${key} OR "releaseCode" = ${key}
      LIMIT 1
    `;
    if (!rows[0]?.id) return null;
    return {
      id: rows[0].id,
      organizationId: requireTenantOrganizationId(rows[0].organizationId),
    };
  } catch (error) {
    logger.warn("scope tenant: release lookup failed; trying unscoped Prisma read", {
      error: error instanceof Error ? error.message : "unknown",
    });
    const row = await prisma.release.findFirst({
      where: { OR: [{ id: key }, { releaseCode: key }] },
      select: { id: true },
    });
    return row ? { id: row.id, organizationId: null } : null;
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
  const row = await findReleaseIdAndOrganization(releaseIdOrCode);
  if (!row) return null;
  if (!releaseRowVisibleToSessionTenant(row.organizationId, organizationId)) return null;
  return row.id;
}

/**
 * Load a release the list already showed, unless it belongs to another org.
 *
 * @param releaseIdOrCode - URL id or releaseCode.
 * @param session - Authenticated session.
 */
export async function lookupReleaseForSessionTenant(
  releaseIdOrCode: string,
  session: SessionUser
): Promise<TenantReleaseLookup> {
  const row = await findReleaseIdAndOrganization(releaseIdOrCode);
  if (!row) return { ok: false, code: "NOT_FOUND" };

  const tenant = await resolveScopeTenant(session);
  const sessionOrg = tenant?.organizationId ?? null;
  if (!releaseRowVisibleToSessionTenant(row.organizationId, sessionOrg)) {
    return { ok: false, code: "NOT_FOUND" };
  }

  return {
    ok: true,
    releaseId: row.id,
    tenant: { organizationId: sessionOrg ?? row.organizationId },
  };
}

/**
 * True when the stored file tenant key is this session organization.
 *
 * @param fileTenantKey - tenantKey on ReleaseScopeFile.
 * @param organizationId - Session organization id.
 */
export function assertSameTenantFile(
  fileTenantKey: string,
  organizationId: string | null | undefined
): boolean {
  const fileKey = requireTenantOrganizationId(fileTenantKey);
  const orgId = requireTenantOrganizationId(organizationId);
  return Boolean(fileKey && orgId && fileKey === orgId);
}
