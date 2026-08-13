/**
 * Pure helpers for Category B event hooks (no DB).
 */
import type { DriftLifecycleConfig } from "@/lib/drift-lifecycle-config";
import { resolveDriftLifecycleStatusRef } from "@/lib/drift-lifecycle-transition";

/**
 * Canonical ordered pair of release codes for conflict uniqueness.
 */
export function orderedReleaseCodes(
  a: string,
  b: string
): [string, string] {
  return a.localeCompare(b) <= 0 ? [a, b] : [b, a];
}

/**
 * True when a drift status is the auto-escalate target (`escalateTarget`).
 */
export function isDriftEscalatedStatus(
  status: string,
  config: DriftLifecycleConfig
): boolean {
  const resolved = resolveDriftLifecycleStatusRef(config, status);
  return Boolean(resolved?.enabled && resolved.escalateTarget);
}
