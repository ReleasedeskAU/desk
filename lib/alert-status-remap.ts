/**
 * One-time live-row remap for the Alert sheet rebuild.
 * Pending → Active, Actioned → Resolved, Dismissed/Expired → Closed,
 * then backfill statusKey on every row.
 */
import { resolveAlertLifecycleStatusRef } from "@/lib/alert-lifecycle-transition";
import {
  createDefaultAlertLifecycleConfig,
  type AlertLifecycleConfig,
} from "@/lib/alert-lifecycle-config";

const INTAKE_KEY = "active";

export type AlertStatusRemap = {
  status: string;
  statusKey: string;
  changed: boolean;
};

/**
 * Canonical status + key for a stored MonitoringAlert row after the sheet rebuild.
 * @param status - Current label (may be empty)
 * @param statusKey - Current key (may be empty)
 * @param config - Live alert graph (defaults to enterprise sheet)
 */
export function remapAlertRowStatus(
  status: string | null | undefined,
  statusKey: string | null | undefined,
  config: AlertLifecycleConfig = createDefaultAlertLifecycleConfig()
): AlertStatusRemap {
  const intake =
    config.statuses.find((s) => s.enabled && s.isIntake) ??
    config.statuses.find((s) => s.key === INTAKE_KEY);
  const rawStatus = String(status ?? "").trim();
  const rawKey = String(statusKey ?? "").trim();
  if (!rawStatus && !rawKey) {
    return {
      status: intake?.label ?? "Active",
      statusKey: intake?.key ?? INTAKE_KEY,
      changed: true,
    };
  }
  const resolved =
    resolveAlertLifecycleStatusRef(config, rawKey || rawStatus) ??
    resolveAlertLifecycleStatusRef(config, rawStatus);
  if (!resolved) {
    return {
      status: intake?.label ?? "Active",
      statusKey: intake?.key ?? INTAKE_KEY,
      changed: true,
    };
  }
  return {
    status: resolved.label,
    statusKey: resolved.key,
    changed: resolved.label !== rawStatus || resolved.key !== rawKey,
  };
}
