/**
 * Pure threshold lookups from a risk lifecycle config (cron personalization).
 */
import type { RiskLifecycleConfig } from "@/lib/risk-lifecycle-config";
import { createDefaultRiskLifecycleConfig } from "@/lib/risk-lifecycle-config";
import type { ApprovalLifecycleConfig } from "@/lib/approval-lifecycle-config";
import { createDefaultApprovalLifecycleConfig } from "@/lib/approval-lifecycle-config";
import type { SignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import { createDefaultSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import { resolveRiskLifecycleStatusRef } from "@/lib/risk-lifecycle-transition";
import { resolveApprovalLifecycleStatusRef } from "@/lib/approval-lifecycle-transition";

/**
 * Resolve escalateAfterDays for a risk status label using the given config.
 * @param statusLabel - Risk.status as stored
 * @param config - Owner or default risk lifecycle config
 */
export function escalateAfterDaysForRiskStatus(
  statusLabel: string,
  config: RiskLifecycleConfig = createDefaultRiskLifecycleConfig()
): number | null {
  const resolved = resolveRiskLifecycleStatusRef(config, statusLabel);
  return resolved?.escalateAfterDays ?? null;
}

/**
 * Resolve Approved-status expiryDays from an approval lifecycle config.
 */
export function approvalExpiryDays(
  config: ApprovalLifecycleConfig = createDefaultApprovalLifecycleConfig()
): number | null {
  const approved = resolveApprovalLifecycleStatusRef(config, "approved")
    ?? config.statuses.find((s) => s.key === "approved");
  return approved?.expiryDays ?? null;
}

/**
 * Resolve Pending-status expiryDays from a sign-off lifecycle config.
 */
export function signoffPendingExpiryDays(
  config: SignoffLifecycleConfig = createDefaultSignoffLifecycleConfig()
): number | null {
  const pending = config.statuses.find((s) => s.key === "pending");
  return pending?.expiryDays ?? null;
}
