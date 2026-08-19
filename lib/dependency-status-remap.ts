/**
 * One-time live-row remap for the sheet rebuild.
 * Clear → Resolved, empty → Identified, Waived → Removed, then backfill statusKey.
 */
import { resolveDependencyLifecycleStatusRef } from "@/lib/dependency-lifecycle-transition";
import {
  createDefaultDependencyLifecycleConfig,
  type DependencyLifecycleConfig,
} from "@/lib/dependency-lifecycle-config";

const INTAKE_KEY = "identified";

export type DependencyStatusRemap = {
  status: string;
  statusKey: string;
  changed: boolean;
};

/**
 * Canonical status + key for a stored dependency row after the sheet rebuild.
 * @param status - Current label (may be empty)
 * @param statusKey - Current key (may be empty)
 * @param config - Live dependency graph (defaults to enterprise sheet)
 */
export function remapDependencyRowStatus(
  status: string | null | undefined,
  statusKey: string | null | undefined,
  config: DependencyLifecycleConfig = createDefaultDependencyLifecycleConfig()
): DependencyStatusRemap {
  const intake =
    config.statuses.find((s) => s.enabled && s.isIntake) ??
    config.statuses.find((s) => s.key === INTAKE_KEY);
  const rawStatus = String(status ?? "").trim();
  const rawKey = String(statusKey ?? "").trim();
  if (!rawStatus && !rawKey) {
    return {
      status: intake?.label ?? "Identified",
      statusKey: intake?.key ?? INTAKE_KEY,
      changed: true,
    };
  }
  const resolved =
    resolveDependencyLifecycleStatusRef(config, rawKey || rawStatus) ??
    resolveDependencyLifecycleStatusRef(config, rawStatus);
  if (!resolved) {
    return {
      status: intake?.label ?? "Identified",
      statusKey: intake?.key ?? INTAKE_KEY,
      changed: true,
    };
  }
  const nextStatus = resolved.label;
  const nextKey = resolved.key;
  return {
    status: nextStatus,
    statusKey: nextKey,
    changed: nextStatus !== rawStatus || nextKey !== rawKey,
  };
}
