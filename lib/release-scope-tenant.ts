/**
 * Session-tenant resolution for native Scope and release GET/list.
 * Platform is multi-tenant — a different non-null organizationId is another tenant.
 *
 * List and detail use the same session org when RELEASE_TENANT_SCOPE=on
 * (directory User.organizationId, else Clerk Organization.id). Do not use
 * getDefaultOrganizationId. Do not skip the org match on detail while on.
 * Temporarily off by default until Clerk orgs are linked to the data tenant.
 */

import { auth } from "@clerk/nextjs/server";
import type { SessionUser } from "@/lib/auth/roles";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resolveDirectoryUser } from "@/lib/release-directory-user";
import { isReleaseTenantScopeEnabled } from "@/lib/release-tenant-scope-flag";

export type ScopeTenantContext = {
  /** Session data-plane organization id. */
  organizationId: string;
};

export type TenantReleaseLookup =
  | { ok: true; releaseId: string; tenant: ScopeTenantContext }
  | { ok: false; code: "TENANT_REQUIRED" | "NOT_FOUND" };

export type TenantReleaseListWhere<T extends object> =
  | { ok: true; where: T | { AND: [T, { id: { in: string[] } }] } }
  | { ok: false; code: "TENANT_REQUIRED" };

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
 * Whether this session may load a release the list would also return.
 * Both sides must be a real org id and they must match. Null / empty is not
 * visible — that would skip the tenant check.
 *
 * @param releaseOrganizationId - organizationId on the Release row.
 * @param sessionOrganizationId - Session data-plane org.
 */
export function releaseRowVisibleToSessionTenant(
  releaseOrganizationId: string | null | undefined,
  sessionOrganizationId: string | null | undefined
): boolean {
  const rowOrg = requireTenantOrganizationId(releaseOrganizationId);
  const sessionOrg = requireTenantOrganizationId(sessionOrganizationId);
  return Boolean(rowOrg && sessionOrg && rowOrg === sessionOrg);
}

/**
 * AND a release list filter with the session tenant's release ids.
 * Same membership as detail GET (`organizationId` equality).
 *
 * @param where - Existing list filters (status, department, …).
 * @param tenantIds - Release ids in the session organization.
 */
export function andReleaseWhereTenantIds<T extends object>(
  where: T,
  tenantIds: string[]
): { AND: [T, { id: { in: string[] } }] } {
  return { AND: [where, { id: { in: tenantIds } }] };
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
 * Missing tenant → caller must deny.
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
    logger.warn("scope tenant: release lookup failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

/**
 * Release ids stamped with this organization (same predicate as detail GET).
 *
 * @param organizationId - Session organization id.
 */
export async function listReleaseIdsForOrganization(
  organizationId: string
): Promise<string[]> {
  const orgId = requireTenantOrganizationId(organizationId);
  if (!orgId) return [];

  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Release" WHERE "organizationId" = ${orgId}
    `;
    return rows.map((row) => row.id).filter(Boolean);
  } catch (error) {
    logger.warn("scope tenant: tenant release list failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}

/**
 * Restrict a Prisma release list to the session tenant. Fail closed when the
 * session has no org — never return an unscoped dump — unless tenant scope is
 * temporarily off (RELEASE_TENANT_SCOPE).
 *
 * @param session - Authenticated session.
 * @param where - Existing list filters.
 */
export async function releaseWhereForSessionTenant<T extends object>(
  session: SessionUser,
  where: T
): Promise<TenantReleaseListWhere<T>> {
  if (!isReleaseTenantScopeEnabled()) return { ok: true, where };
  const tenant = await resolveScopeTenant(session);
  if (!tenant) return { ok: false, code: "TENANT_REQUIRED" };
  const ids = await listReleaseIdsForOrganization(tenant.organizationId);
  return { ok: true, where: andReleaseWhereTenantIds(where, ids) };
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
  if (!orgId) return null;
  const row = await findReleaseIdAndOrganization(releaseIdOrCode);
  if (!row) return null;
  if (!releaseRowVisibleToSessionTenant(row.organizationId, orgId)) return null;
  return row.id;
}

/**
 * Load a release for the session. Tenant on: org must match. Tenant off: any org.
 *
 * @param releaseIdOrCode - URL id or releaseCode.
 * @param session - Authenticated session.
 */
export async function lookupReleaseForSessionTenant(
  releaseIdOrCode: string,
  session: SessionUser
): Promise<TenantReleaseLookup> {
  if (!isReleaseTenantScopeEnabled()) {
    const row = await findReleaseIdAndOrganization(releaseIdOrCode);
    if (!row) return { ok: false, code: "NOT_FOUND" };
    const tenant = row.organizationId
      ? { organizationId: row.organizationId }
      : await resolveScopeTenant(session);
    if (!tenant) return { ok: false, code: "TENANT_REQUIRED" };
    return { ok: true, releaseId: row.id, tenant };
  }
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
export function assertSameTenantFile(
  fileTenantKey: string,
  organizationId: string | null | undefined
): boolean {
  const fileKey = requireTenantOrganizationId(fileTenantKey);
  const orgId = requireTenantOrganizationId(organizationId);
  return Boolean(fileKey && orgId && fileKey === orgId);
}
