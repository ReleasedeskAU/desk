/**
 * Temporary switch for session-tenant release scoping.
 * Off: signed-in users see every org's releases (requested until Clerk/directory
 * tenants are linked). On: list/detail/pickers stay exact organizationId match.
 *
 * Set RELEASE_TENANT_SCOPE=on to restore enforcement. Default is off.
 */

const TRUTHY = new Set(["on", "true", "1"]);
const FALSY = new Set(["off", "false", "0"]);

export const RELEASE_TENANT_SCOPE_ENV = "RELEASE_TENANT_SCOPE";

/**
 * Whether release list, detail, pickers, and related reads must match session org.
 */
export function isReleaseTenantScopeEnabled(): boolean {
  const raw = process.env[RELEASE_TENANT_SCOPE_ENV]?.trim().toLowerCase();
  if (raw && TRUTHY.has(raw)) return true;
  if (raw && FALSY.has(raw)) return false;
  return false;
}
