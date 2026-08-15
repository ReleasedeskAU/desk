/**
 * Pure alert status transition validation against a lifecycle config.
 * Flexible unmet soft-gates require overrideReason. Required gates never override.
 */
import type {
  AlertLifecycleConfig,
  AlertLifecycleStatusConfig,
  AlertLifecycleTransitionConfig,
} from "@/lib/alert-lifecycle-config";
import {
  ALERT_LIFECYCLE_GATE_CATALOG,
  type AlertLifecycleGateAttachment,
  type AlertLifecycleGateType,
} from "@/lib/alert-lifecycle-gates";

export const MIN_ALERT_OVERRIDE_REASON_LENGTH = 3;

/**
 * Leftover labels that are no longer current display names.
 * Checked only after key/label match so new statuses are never hidden.
 */
const ALERT_STATUS_LEFTOVER_ALIASES: Readonly<Record<string, string>> = {
  pending: "pending",
  actioned: "actioned",
  open: "pending",
};

export type AlertGateFacts = {
  /** Dismissal justification stored on the alert (not overrideReason). */
  notes: string | null | undefined;
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

/**
 * Resolve an alert status by key or current label, then leftover aliases.
 */
export function resolveAlertLifecycleStatusRef(
  config: AlertLifecycleConfig,
  raw: string | null | undefined
): AlertLifecycleStatusConfig | null {
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
  const leftoverKey = ALERT_STATUS_LEFTOVER_ALIASES[lower];
  if (leftoverKey) {
    const aliased = config.statuses.find((s) => s.key === leftoverKey);
    if (aliased) return aliased;
  }
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

function evaluateCatalogGate(
  gateType: AlertLifecycleGateType,
  facts: AlertGateFacts
): string | null {
  if (gateType === "dismissal_justification_set") {
    if (!hasText(facts.notes)) {
      return ALERT_LIFECYCLE_GATE_CATALOG.dismissal_justification_set.description;
    }
  }
  return null;
}

/**
 * Catalog gates attached to a transition (enabled attachments only).
 */
export function evaluateAlertSoftGates(args: {
  transition: AlertLifecycleTransitionConfig;
  facts: AlertGateFacts;
}): string[] {
  const unmet: string[] = [];
  const gates = [...(args.transition.gates ?? [])]
    .filter((gate) => gate.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const gate of gates) {
    const message = evaluateCatalogGate(gate.gateType, args.facts);
    if (message) unmet.push(message);
  }
  return unmet;
}

function gateBlocksOverride(gate: AlertLifecycleGateAttachment): boolean {
  return gate.enforcement === "required";
}

/**
 * Validate an alert status change against the config graph + catalog gates.
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
    notes: args.facts?.notes ?? null,
  };
  const unmet = evaluateAlertSoftGates({ transition, facts });

  if (unmet.length > 0) {
    const requiredUnmet = (transition.gates ?? []).some(
      (gate) =>
        gate.enabled &&
        gateBlocksOverride(gate) &&
        evaluateCatalogGate(gate.gateType, facts)
    );
    if (transition.enforcement === "required" || requiredUnmet) {
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

export type LegalNextAlertStatus = {
  key: string;
  label: string;
};

/**
 * Enabled next statuses from the current Alert status, in transition order.
 * Required (cron-only) edges are omitted from the Edit dropdown.
 * @param config - Caller Alert lifecycle config
 * @param fromStatus - Current status key or label
 */
export function legalNextAlertStatuses(
  config: AlertLifecycleConfig,
  fromStatus: string
): LegalNextAlertStatus[] {
  const from = resolveAlertLifecycleStatusRef(config, fromStatus);
  if (!from || from.terminal || !from.enabled) return [];
  return config.transitions
    .filter(
      (transition) =>
        transition.enabled &&
        transition.fromKey === from.key &&
        transition.enforcement !== "required"
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((transition) =>
      config.statuses.find((item) => item.key === transition.toKey && item.enabled)
    )
    .filter((item): item is AlertLifecycleStatusConfig => Boolean(item))
    .map((item) => ({ key: item.key, label: item.label }));
}
