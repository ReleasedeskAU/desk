/**
 * UI affordances for recording, editing, or withdrawing a sign-off decision.
 * Writes stay on PATCH /api/releases/[id]; this module only decides what to offer.
 *
 * Independent of list-row Edit (RD-115). Uses lifecycle editMode / terminal flags
 * and the transition graph — not tenant status labels.
 */
import type { SignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import { isSignoffValueEditable } from "@/lib/signoff-lifecycle-edit-policy";
import {
  legalNextSignoffStatuses,
  resolveSignoffLifecycleStatusRef,
} from "@/lib/signoff-lifecycle-transition";

/** System key for the withdraw exit. Display labels are tenant-configurable. */
export const SIGNOFF_WITHDRAW_STATUS_KEY = "withdrawn";

/**
 * Whether this stored (or empty/intake) decision may still change.
 * Unknown status or missing config fails closed.
 *
 * @param config - Live sign-off lifecycle, or null when not loaded.
 * @param status - Stored label/key, or empty for a new pending cell.
 * @returns True only for an enabled, non-terminal, non-immutable status.
 */
export function isSignoffDecisionStillEditable(
  config: SignoffLifecycleConfig | null | undefined,
  status: string | null | undefined
): boolean {
  if (!config) return false;
  const resolved = resolveSignoffLifecycleStatusRef(config, status);
  if (!resolved?.enabled) return false;
  if (resolved.terminal) return false;
  return isSignoffValueEditable(resolved.editMode);
}

/**
 * Manual next-decision labels (hides required-only exits such as SLA Expired).
 *
 * @param config - Live sign-off lifecycle.
 * @param status - Current stored value, or empty for intake.
 * @returns Labels in graph order; empty when the decision is terminal/unknown.
 */
export function signoffManualNextLabels(
  config: SignoffLifecycleConfig,
  status: string | null | undefined
): string[] {
  return legalNextSignoffStatuses(config, status).map((item) => item.label);
}

/**
 * Whether the Record sign-off **Decision** select should be usable.
 * Empty current value is intake/pending — enabled when that status still has exits.
 *
 * @param config - Live sign-off lifecycle, or null when not loaded.
 * @param status - Current value for the chosen type, or null when creating.
 * @returns False when config is missing, the decision is immutable/terminal, or no manual exits exist.
 */
export function signoffDecisionControlEnabled(
  config: SignoffLifecycleConfig | null | undefined,
  status: string | null | undefined
): boolean {
  if (!config || !isSignoffDecisionStillEditable(config, status)) return false;
  return signoffManualNextLabels(config, status).length > 0;
}

/**
 * Label of the withdraw target when that exit is a legal next step from `status`.
 * Uses the system key, then the configured label (never a hardcoded display name).
 *
 * @param config - Live sign-off lifecycle.
 * @param status - Current stored value, or empty for intake.
 * @returns Tenant label to PATCH, or null when withdraw is not offered.
 */
export function signoffWithdrawTargetLabel(
  config: SignoffLifecycleConfig,
  status: string | null | undefined
): string | null {
  if (!isSignoffDecisionStillEditable(config, status)) return null;
  const target = config.statuses.find(
    (item) => item.enabled && item.key === SIGNOFF_WITHDRAW_STATUS_KEY
  );
  if (!target) return null;
  const allowed = legalNextSignoffStatuses(config, status).some(
    (item) => item.key === target.key
  );
  return allowed ? target.label : null;
}

/**
 * Detail-page Edit / withdraw (Delete) flags. Readonly role must pass `roleCanEdit: false`.
 *
 * @param args.roleCanEdit - Existing `canEdit` (editor+); default deny.
 * @param args.config - Live sign-off lifecycle, or null when not loaded.
 * @param args.status - Current decision value.
 * @returns Which header actions to show. Withdraw is the product delete path
 *   (no SignOff table to hard-delete; terminal decisions stay recorded).
 */
export function signoffDetailActionFlags(args: {
  roleCanEdit: boolean;
  config: SignoffLifecycleConfig | null | undefined;
  status: string | null | undefined;
}): { edit: boolean; withdraw: boolean } {
  if (!args.roleCanEdit || !args.config) {
    return { edit: false, withdraw: false };
  }
  return {
    edit: signoffDecisionControlEnabled(args.config, args.status),
    withdraw: Boolean(signoffWithdrawTargetLabel(args.config, args.status)),
  };
}

/**
 * List-page create affordance. Sign-offs are release-field projections; create
 * opens the same record-decision modal (no POST /api/signoffs).
 *
 * @param roleCanEdit - Existing `canEdit` (editor+); default deny.
 * @returns True when the Add New Sign-off control should render.
 */
export function signoffListCreateAllowed(roleCanEdit: boolean): boolean {
  return roleCanEdit === true;
}
