/**
 * Which releases may be picked when creating a dependency or conflict.
 * Uses lifecycle keys (`cancelled`, `blocked`), not tenant display labels.
 */
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import { isReleaseFullyLocked } from "@/lib/release-lifecycle-edit-policy";
import { resolveLifecycleStatusRef } from "@/lib/release-lifecycle-transition";

/** System key for the interrupt stage testers call Blocked. */
export const RELEASE_BLOCKED_STATUS_KEY = "blocked";

export const RELEASE_BLOCKED_NOT_LINKABLE_CODE = "RELEASE_BLOCKED_NOT_LINKABLE";

/**
 * True when `status` is the Blocked system status (label may be renamed).
 *
 * @param config - Live or pinned release lifecycle graph
 * @param status - Stored status label or key
 */
export function isReleaseBlockedForRelatedLink(
  config: ReleaseLifecycleConfig,
  status: string | null | undefined
): boolean {
  return resolveLifecycleStatusRef(config, status)?.key === RELEASE_BLOCKED_STATUS_KEY;
}

/**
 * True when a create picker must omit this release (Cancelled lock or Blocked).
 * Missing config or blank status fails closed — do not guess.
 *
 * @param config - Live release lifecycle graph, or null while loading
 * @param status - Stored status label or key
 */
export function isReleaseExcludedFromRelatedCreate(
  config: ReleaseLifecycleConfig | null | undefined,
  status: string | null | undefined
): boolean {
  if (!config) return true;
  const raw = String(status ?? "").trim();
  if (!raw) return true;
  if (isReleaseFullyLocked(config, raw)) return true;
  return isReleaseBlockedForRelatedLink(config, raw);
}

/**
 * Drop Cancelled and Blocked rows from a related-create lookup.
 *
 * @param releases - Rows that include a status (label or key)
 * @param config - Live graph; when null, returns []
 */
export function filterReleasesForRelatedCreate<T extends { status?: string | null }>(
  releases: readonly T[],
  config: ReleaseLifecycleConfig | null | undefined
): T[] {
  return releases.filter(
    (row) => !isReleaseExcludedFromRelatedCreate(config, row.status)
  );
}

/**
 * True when conflict edit must stay off because a linked release is Cancelled.
 * Missing config fails closed. Blocked does not lock an existing conflict.
 *
 * @param config - Live release lifecycle graph, or null while loading
 * @param linkedStatuses - Status of Release 1 and Release 2
 */
export function isConflictEditLockedByCancelledRelease(
  config: ReleaseLifecycleConfig | null | undefined,
  linkedStatuses: readonly (string | null | undefined)[]
): boolean {
  if (!config) return true;
  return linkedStatuses.some((status) =>
    isReleaseFullyLocked(config, String(status ?? "").trim())
  );
}

/**
 * Plain lock copy when a linked release is Cancelled. Uses the tenant label.
 *
 * @param config - Live graph
 * @param status - Status of the cancelled linked release
 */
export function cancelledLinkedReleaseLockMessage(
  config: ReleaseLifecycleConfig,
  status: string | null | undefined
): string {
  const resolved = resolveLifecycleStatusRef(config, status);
  const fallback = String(status ?? "").trim();
  const label = resolved?.label || fallback || "Cancelled";
  return `This conflict is linked to a release in ${label}. It is locked — nothing can be edited.`;
}
