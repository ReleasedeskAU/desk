/**
 * Pure conflict status transition validation against a lifecycle config.
 * Flexible unmet soft-gates require overrideReason. Required gates never override.
 */
import type {
  ConflictLifecycleConfig,
  ConflictLifecycleStatusConfig,
  ConflictLifecycleTransitionConfig,
} from "@/lib/conflict-lifecycle-config";
import {
  CONFLICT_LIFECYCLE_GATE_CATALOG,
  type ConflictLifecycleGateAttachment,
  type ConflictLifecycleGateType,
} from "@/lib/conflict-lifecycle-gates";

export const MIN_CONFLICT_OVERRIDE_REASON_LENGTH = 3;

/** Legacy seed / UI labels that map onto canonical lifecycle statuses. */
const CONFLICT_STATUS_ALIASES: Readonly<Record<string, string>> = {
  open: "detected",
  detected: "detected",
  "in progress": "under_review",
  in_progress: "under_review",
  "under review": "under_review",
  "pending review": "pending_review",
  pending_review: "pending_review",
  escalated: "escalated",
  closed: "closed",
};

export type ConflictGateFacts = {
  notes: string | null | undefined;
  assignedTo: string | null | undefined;
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

/**
 * Resolve a conflict status by key or label (enabled preferred, then any).
 */
export function resolveConflictLifecycleStatusRef(
  config: ConflictLifecycleConfig,
  raw: string | null | undefined
): ConflictLifecycleStatusConfig | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLocaleLowerCase();
  const aliasKey = CONFLICT_STATUS_ALIASES[lower];
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

export type ConflictTransitionResult =
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

function failMessage(gateType: ConflictLifecycleGateType): string {
  return CONFLICT_LIFECYCLE_GATE_CATALOG[gateType].description;
}

/**
 * Evaluate one attached Conflict check against PATCH/row facts.
 * @returns Plain-English unmet reason, or null when the check passes.
 */
export function evaluateConflictGate(
  gate: ConflictLifecycleGateAttachment,
  facts: ConflictGateFacts
): string | null {
  if (!gate.enabled) return null;
  switch (gate.gateType) {
    case "rm_assessment_set":
      return hasText(facts.assignedTo) ? null : failMessage(gate.gateType);
    case "higher_authority_decision_set":
      return hasText(facts.notes) ? null : failMessage(gate.gateType);
    case "dismissal_justification_set":
      return hasText(facts.notes) ? null : failMessage(gate.gateType);
    default:
      return `Unhandled conflict check: ${String(
        (gate as { gateType: string }).gateType
      )}`;
  }
}

function effectiveEnforcement(
  transition: ConflictLifecycleTransitionConfig,
  gate: ConflictLifecycleGateAttachment
): "flexible" | "required" {
  if (gate.enforcement === "flexible" || gate.enforcement === "required") {
    return gate.enforcement;
  }
  return transition.enforcement;
}

/**
 * Validate a conflict status change against the config graph + catalog gates.
 */
export function validateConflictTransition(args: {
  config: ConflictLifecycleConfig;
  fromStatus: string;
  toStatus: string;
  overrideReason?: string | null;
  facts: ConflictGateFacts;
}): ConflictTransitionResult {
  const from = resolveConflictLifecycleStatusRef(args.config, args.fromStatus);
  const to = resolveConflictLifecycleStatusRef(args.config, args.toStatus);
  if (!from || !to) {
    return {
      allowed: false,
      code: "UNKNOWN_STATUS",
      reason: "Status not in the conflict lifecycle configuration",
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
      reason: `Status "${to.label}" is turned off in the conflict lifecycle configuration`,
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
      reason: `Transition from "${from.label}" to "${to.label}" is not allowed by the conflict lifecycle configuration`,
      fromKey: from.key,
      toKey: to.key,
    };
  }

  const unmetRequired: string[] = [];
  const unmetFlexible: string[] = [];
  for (const gate of transition.gates ?? []) {
    const unmet = evaluateConflictGate(gate, args.facts);
    if (!unmet) continue;
    if (effectiveEnforcement(transition, gate) === "required") {
      unmetRequired.push(unmet);
    } else {
      unmetFlexible.push(unmet);
    }
  }
  if (unmetRequired.length > 0) {
    return {
      allowed: false,
      code: "ILLEGAL_TRANSITION",
      reason: unmetRequired.join("; "),
      unmetReasons: unmetRequired,
      fromKey: from.key,
      toKey: to.key,
    };
  }
  if (unmetFlexible.length > 0) {
    const reasonText = (args.overrideReason ?? "").trim();
    if (reasonText.length < MIN_CONFLICT_OVERRIDE_REASON_LENGTH) {
      return {
        allowed: false,
        code: "TRANSITION_NEEDS_OVERRIDE",
        reason:
          "This step needs an exception note. Some checks aren’t met. Enter a short reason (at least 3 characters) explaining why you’re allowed to continue, then try again.",
        unmetReasons: unmetFlexible,
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
      unmetReasons: unmetFlexible,
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

export type LegalNextConflictStatus = {
  key: string;
  label: string;
};

/**
 * Enabled next statuses from the current Conflict status, in transition order.
 * @param config - Caller Conflict lifecycle config.
 * @param fromStatus - Current status key or label.
 * @returns Legal next status key/label pairs.
 */
export function legalNextConflictStatuses(
  config: ConflictLifecycleConfig,
  fromStatus: string
): LegalNextConflictStatus[] {
  const from = resolveConflictLifecycleStatusRef(config, fromStatus);
  if (!from || from.terminal || !from.enabled) return [];
  return config.transitions
    .filter((transition) => transition.enabled && transition.fromKey === from.key)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((transition) =>
      config.statuses.find(
        (item) => item.key === transition.toKey && item.enabled
      )
    )
    .filter((item): item is ConflictLifecycleStatusConfig => Boolean(item))
    .map((item) => ({ key: item.key, label: item.label }));
}
