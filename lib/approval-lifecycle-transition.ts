/**
 * Pure approval decision transition validation against a lifecycle config.
 * Flexible edges off the expected path need overrideReason; destinations
 * flagged requiresConditions need a conditions note.
 */
import type {
  ApprovalLifecycleConfig,
  ApprovalLifecycleStatusConfig,
} from "@/lib/approval-lifecycle-config";
import { isApprovalTerminalExpiryExit } from "@/lib/approval-lifecycle-config";

export const MIN_APPROVAL_OVERRIDE_REASON_LENGTH = 3;

export type LegalNextApprovalDecision = {
  key: string;
  label: string;
};

/**
 * Resolve an approval decision by key or label (enabled preferred, then any).
 */
export function resolveApprovalLifecycleStatusRef(
  config: ApprovalLifecycleConfig,
  raw: string | null | undefined
): ApprovalLifecycleStatusConfig | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLocaleLowerCase();
  const byKeyEnabled = config.statuses.find((s) => s.key === trimmed && s.enabled);
  if (byKeyEnabled) return byKeyEnabled;
  const byLabelEnabled = config.statuses.find(
    (s) => s.enabled && s.label.trim().toLocaleLowerCase() === lower
  );
  if (byLabelEnabled) return byLabelEnabled;
  return (
    config.statuses.find((s) => s.key === trimmed) ??
    config.statuses.find((s) => s.label.trim().toLocaleLowerCase() === lower) ??
    null
  );
}

/**
 * Lowest-sortOrder enabled Flexible outgoing edge — the expected CAB path.
 * @returns Destination key, or null when there is no Flexible exit.
 */
export function expectedFlexibleApprovalToKey(
  config: ApprovalLifecycleConfig,
  fromKey: string
): string | null {
  const flexible = config.transitions
    .filter(
      (t) => t.enabled && t.fromKey === fromKey && t.enforcement === "flexible"
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return flexible[0]?.toKey ?? null;
}

export type ApprovalTransitionResult =
  | {
      allowed: true;
      overridden: boolean;
      fromKey: string;
      toKey: string;
      canonicalStatus: string;
      overrideReason?: string;
      unmetReasons?: string[];
    }
  | {
      allowed: false;
      code:
        | "UNKNOWN_STATUS"
        | "ILLEGAL_TRANSITION"
        | "TRANSITION_NEEDS_OVERRIDE"
        | "CONDITIONS_REQUIRED";
      reason: string;
      fromKey?: string;
      toKey?: string;
      unmetReasons?: string[];
    };

function isPresent(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

/**
 * Validate an approval decision change against the config graph.
 * Terminal expiry exits follow expiryDays + unique Required outgoing (AV-22).
 */
export function validateApprovalTransition(args: {
  config: ApprovalLifecycleConfig;
  fromStatus: string;
  toStatus: string;
  overrideReason?: string | null;
  conditions?: string | null;
}): ApprovalTransitionResult {
  const from = resolveApprovalLifecycleStatusRef(args.config, args.fromStatus);
  const to = resolveApprovalLifecycleStatusRef(args.config, args.toStatus);
  if (!from || !to) {
    return {
      allowed: false,
      code: "UNKNOWN_STATUS",
      reason: "Decision not in the approval lifecycle configuration",
    };
  }
  if (from.key === to.key) {
    return {
      allowed: true,
      overridden: false,
      fromKey: from.key,
      toKey: to.key,
      canonicalStatus: to.label,
    };
  }
  const transition = args.config.transitions.find(
    (item) =>
      item.enabled && item.fromKey === from.key && item.toKey === to.key
  );
  const isExpiryExit =
    Boolean(transition) &&
    isApprovalTerminalExpiryExit(args.config, from, transition!);

  if (from.terminal && !isExpiryExit) {
    return {
      allowed: false,
      code: "ILLEGAL_TRANSITION",
      reason: `Decision "${from.label}" is terminal — no further transitions are allowed`,
      fromKey: from.key,
      toKey: to.key,
    };
  }
  if (!to.enabled) {
    return {
      allowed: false,
      code: "ILLEGAL_TRANSITION",
      reason: `Decision "${to.label}" is turned off in the approval lifecycle configuration`,
      fromKey: from.key,
      toKey: to.key,
    };
  }
  if (!transition) {
    return {
      allowed: false,
      code: "ILLEGAL_TRANSITION",
      reason: `Transition from "${from.label}" to "${to.label}" is not allowed by the approval lifecycle configuration`,
      fromKey: from.key,
      toKey: to.key,
    };
  }

  if (to.requiresConditions && !isPresent(args.conditions)) {
    return {
      allowed: false,
      code: "CONDITIONS_REQUIRED",
      reason:
        "This decision needs the conditions written down — the terms this approval is subject to. Add them, then save.",
      fromKey: from.key,
      toKey: to.key,
      unmetReasons: [
        "Record the conditions this approval is subject to (plain text).",
      ],
    };
  }

  const expectedTo = expectedFlexibleApprovalToKey(args.config, from.key);
  const isUnusualFlexible =
    transition.enforcement === "flexible" &&
    expectedTo != null &&
    to.key !== expectedTo;

  if (isUnusualFlexible) {
    const conditionsText = (args.conditions ?? "").trim();
    const reasonText = (args.overrideReason ?? "").trim();
    // Conditions text counts as the recorded reason when the destination requires it.
    const recorded =
      to.requiresConditions && conditionsText.length >= MIN_APPROVAL_OVERRIDE_REASON_LENGTH
        ? conditionsText
        : reasonText;
    if (recorded.length < MIN_APPROVAL_OVERRIDE_REASON_LENGTH) {
      return {
        allowed: false,
        code: "TRANSITION_NEEDS_OVERRIDE",
        reason:
          `“${to.label}” is not the usual next step from “${from.label}”. Add a short reason to continue — this is recorded.`,
        fromKey: from.key,
        toKey: to.key,
        unmetReasons: [
          `Usual next step from ${from.label} is ${
            args.config.statuses.find((s) => s.key === expectedTo)?.label ?? expectedTo
          }.`,
        ],
      };
    }
    return {
      allowed: true,
      overridden: true,
      fromKey: from.key,
      toKey: to.key,
      canonicalStatus: to.label,
      overrideReason: recorded,
    };
  }

  return {
    allowed: true,
    overridden: false,
    fromKey: from.key,
    toKey: to.key,
    canonicalStatus: to.label,
  };
}

/**
 * Enabled next decision labels from the current decision (includes Required edges).
 */
export function listLegalNextApprovalDecisions(
  config: ApprovalLifecycleConfig,
  fromStatus: string
): string[] {
  return legalNextApprovalDecisions(config, fromStatus, { includeRequired: true }).map(
    (s) => s.label
  );
}

/**
 * Enabled next decisions from the current one, in transition sort order.
 * Required (cron) edges are hidden unless includeRequired is set.
 */
export function legalNextApprovalDecisions(
  config: ApprovalLifecycleConfig,
  fromStatus: string,
  opts?: { includeRequired?: boolean }
): LegalNextApprovalDecision[] {
  const from = resolveApprovalLifecycleStatusRef(config, fromStatus);
  if (!from || !from.enabled) return [];
  return config.transitions
    .filter((t) => {
      if (!t.enabled || t.fromKey !== from.key) return false;
      if (!opts?.includeRequired && t.enforcement === "required") return false;
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => config.statuses.find((s) => s.key === t.toKey && s.enabled))
    .filter((s): s is ApprovalLifecycleStatusConfig => Boolean(s))
    .map((s) => ({ key: s.key, label: s.label }));
}

/**
 * True when this decision should revert the linked release (role flag).
 */
export function approvalDecisionRevertsLinkedRelease(
  config: ApprovalLifecycleConfig,
  decision: string
): boolean {
  const resolved = resolveApprovalLifecycleStatusRef(config, decision);
  return Boolean(resolved?.enabled && resolved.revertsLinkedReleaseOnEnter);
}
