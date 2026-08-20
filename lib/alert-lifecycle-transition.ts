/**
 * Pure alert status transition validation against a lifecycle config.
 * Flexible unmet checks require overrideReason (warn + override).
 * No Dismissed/Expired statuses — those labels alias to Closed.
 */
import type {
  AlertLifecycleConfig,
  AlertLifecycleStatusConfig,
} from "@/lib/alert-lifecycle-config";

export const MIN_ALERT_OVERRIDE_REASON_LENGTH = 3;

/**
 * Retired labels/keys that map onto canonical sheet statuses.
 * Do not alias first-class sheet keys (active, investigating, resolved, closed).
 */
const ALERT_STATUS_ALIASES: Readonly<Record<string, string>> = {
  pending: "active",
  actioned: "resolved",
  dismissed: "closed",
  expired: "closed",
  open: "active",
};

export type AlertGateFacts = {
  /** Override / justification text (Flexible unmet checks). */
  reason: string | null | undefined;
  /** Optional notes (main PATCH / Checks catalog). Feature edges are ungated. */
  notes?: string | null;
};

/**
 * Resolve an alert status by key or label (enabled preferred, then any).
 */
export function resolveAlertLifecycleStatusRef(
  config: AlertLifecycleConfig,
  raw: string | null | undefined
): AlertLifecycleStatusConfig | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLocaleLowerCase();
  const aliasKey = ALERT_STATUS_ALIASES[lower];
  if (aliasKey) {
    const aliased = config.statuses.find((s) => s.key === aliasKey);
    if (aliased) return aliased;
  }
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

export type AlertTransitionResult =
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
      code: "UNKNOWN_STATUS" | "ILLEGAL_TRANSITION" | "TRANSITION_NEEDS_OVERRIDE";
      reason: string;
      fromKey?: string;
      toKey?: string;
      unmetReasons?: string[];
    };

/**
 * Soft checks for an alert move. Sheet edges are ungated today; keep the hook
 * so a later catalog can attach without a hardcoded status-key check.
 */
export function evaluateAlertSoftGates(_args: {
  fromKey: string;
  toKey: string;
  facts: AlertGateFacts;
}): string[] {
  return [];
}

/**
 * Validate an alert status change against the config graph + soft gates.
 */
export function validateAlertTransition(args: {
  config: AlertLifecycleConfig;
  fromStatus: string;
  toStatus: string;
  overrideReason?: string | null;
  facts?: AlertGateFacts;
}): AlertTransitionResult {
  const from = resolveAlertLifecycleStatusRef(args.config, args.fromStatus);
  const to = resolveAlertLifecycleStatusRef(args.config, args.toStatus);
  if (!from || !to) {
    return {
      allowed: false,
      code: "UNKNOWN_STATUS",
      reason: "Status not in the alert lifecycle configuration",
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
  if (from.terminal) {
    return {
      allowed: false,
      code: "ILLEGAL_TRANSITION",
      reason: `Status "${from.label}" is terminal — no further transitions are allowed`,
      fromKey: from.key,
      toKey: to.key,
    };
  }
  if (!to.enabled) {
    return {
      allowed: false,
      code: "ILLEGAL_TRANSITION",
      reason: `Status "${to.label}" is turned off in the alert lifecycle configuration`,
      fromKey: from.key,
      toKey: to.key,
    };
  }
  const transition = args.config.transitions.find(
    (item) =>
      item.enabled && item.fromKey === from.key && item.toKey === to.key
  );
  if (!transition) {
    return {
      allowed: false,
      code: "ILLEGAL_TRANSITION",
      reason: `Transition from "${from.label}" to "${to.label}" is not allowed by the alert lifecycle configuration`,
      fromKey: from.key,
      toKey: to.key,
    };
  }

  const facts: AlertGateFacts = {
    reason: args.facts?.reason ?? args.overrideReason ?? null,
  };
  const unmet = evaluateAlertSoftGates({
    fromKey: from.key,
    toKey: to.key,
    facts,
  });

  if (unmet.length > 0) {
    if (transition.enforcement === "required") {
      return {
        allowed: false,
        code: "ILLEGAL_TRANSITION",
        reason: unmet.join("; "),
        unmetReasons: unmet,
        fromKey: from.key,
        toKey: to.key,
      };
    }
    const reasonText = (args.overrideReason ?? "").trim();
    if (reasonText.length < MIN_ALERT_OVERRIDE_REASON_LENGTH) {
      return {
        allowed: false,
        code: "TRANSITION_NEEDS_OVERRIDE",
        reason:
          "This step needs an exception note. Some checks aren’t met. Enter a short reason (at least 3 characters) explaining why you’re allowed to continue, then try again.",
        unmetReasons: unmet,
        fromKey: from.key,
        toKey: to.key,
      };
    }
    return {
      allowed: true,
      overridden: true,
      fromKey: from.key,
      toKey: to.key,
      canonicalStatus: to.label,
      overrideReason: reasonText,
      unmetReasons: unmet,
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

export type LegalNextAlertStatus = { key: string; label: string };

/**
 * Enabled next statuses from the current one, in transition sort order.
 */
export function legalNextAlertStatuses(
  config: AlertLifecycleConfig,
  fromStatus: string
): LegalNextAlertStatus[] {
  const from = resolveAlertLifecycleStatusRef(config, fromStatus);
  if (!from || from.terminal || !from.enabled) return [];
  return config.transitions
    .filter((item) => item.enabled && item.fromKey === from.key)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => config.statuses.find((s) => s.key === item.toKey && s.enabled))
    .filter((s): s is AlertLifecycleStatusConfig => Boolean(s))
    .map((s) => ({ key: s.key, label: s.label }));
}
