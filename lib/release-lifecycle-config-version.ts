/**
 * Lifecycle config versioning helpers (pin resolution + snapshot parse).
 *
 * Persistence lives in release-lifecycle-config-db.ts. This module stays pure
 * so pin semantics can be unit-tested without a database.
 */
import {
  normalizeReleaseLifecycleConfigResult,
  type ReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config";

/** How enforcement should interpret a release's lifecycleConfigVersionId. */
export type LifecycleConfigPinKind = "pinned" | "latest-unpinned";

/** Resolved config used for transition/gate evaluation. */
export type ResolvedReleaseLifecycleConfig = {
  config: ReleaseLifecycleConfig;
  /** Version row id when known (pinned or latest). Null only if no versions exist yet. */
  versionId: string | null;
  /** Monotonic version number when known. */
  version: number | null;
  configPin: LifecycleConfigPinKind;
};

/**
 * Derive pin kind from a release's stored FK.
 * Null/undefined means legacy unpinned — follows latest config.
 */
export function lifecycleConfigPinKind(
  lifecycleConfigVersionId: string | null | undefined
): LifecycleConfigPinKind {
  return lifecycleConfigVersionId ? "pinned" : "latest-unpinned";
}

/**
 * Next monotonic version number after the current max (null → 1).
 */
export function nextLifecycleConfigVersionNumber(
  currentMax: number | null | undefined
): number {
  if (currentMax == null || currentMax < 1) return 1;
  return currentMax + 1;
}

/**
 * Parse a stored JSON snapshot into a normalized ReleaseLifecycleConfig.
 * Invalid snapshots fall back loudly via normalizeReleaseLifecycleConfigResult.
 *
 * @param snapshot - JSON from UserReleaseLifecycleConfigVersion.snapshot
 * @param context - Optional clerkUserId for fallback logging
 * @returns Normalized config plus fallback flag when Enterprise Default was used
 */
export function parseLifecycleConfigSnapshot(
  snapshot: unknown,
  context?: { clerkUserId?: string }
): {
  config: ReleaseLifecycleConfig;
  usedEnterpriseDefaultFallback: boolean;
  fallbackReason?: string;
} {
  const result = normalizeReleaseLifecycleConfigResult(snapshot, context);
  return {
    config: result.config,
    usedEnterpriseDefaultFallback: result.usedEnterpriseDefaultFallback,
    ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
  };
}

/**
 * Build the resolved-config result for a release given pin + loaded configs.
 * Pure: callers supply the pinned snapshot config and/or latest head.
 */
export function resolveLifecycleConfigPin(args: {
  lifecycleConfigVersionId: string | null | undefined;
  pinned?: {
    versionId: string;
    version: number;
    config: ReleaseLifecycleConfig;
  } | null;
  latest: {
    versionId: string | null;
    version: number | null;
    config: ReleaseLifecycleConfig;
  };
}): ResolvedReleaseLifecycleConfig {
  const pin = lifecycleConfigPinKind(args.lifecycleConfigVersionId);
  if (pin === "pinned" && args.pinned) {
    return {
      config: args.pinned.config,
      versionId: args.pinned.versionId,
      version: args.pinned.version,
      configPin: "pinned",
    };
  }
  // Missing pin row, or deliberately unpinned: follow latest.
  return {
    config: args.latest.config,
    versionId: args.latest.versionId,
    version: args.latest.version,
    configPin: "latest-unpinned",
  };
}
