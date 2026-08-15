/**
 * Pure risk status transition validation against a lifecycle config.
 * Flexible unmet soft-gates require overrideReason (warn + override).
 */
import {
  RISK_HIGH_SCORE_THRESHOLD,
  type RiskLifecycleConfig,
  type RiskLifecycleStatusConfig,
  type RiskLifecycleTransitionConfig,
} from "@/lib/risk-lifecycle-config";
import {
  RISK_LIFECYCLE_GATE_CATALOG,
  type RiskLifecycleGateAttachment,
  type RiskLifecycleGateType,
} from "@/lib/risk-lifecycle-gates";

export const MIN_RISK_OVERRIDE_REASON_LENGTH = 3;

/** Legacy seed / UI labels that map onto canonical lifecycle statuses. */
const RISK_STATUS_ALIASES: Readonly<Record<string, string>> = {
  open: "identified",
  identified: "identified",
  assessing: "assessing",
  monitoring: "mitigated",
  mitigated: "mitigated",
  "in progress": "assessing",
  in_progress: "assessing",
};

export type RiskGateFacts = {
  likelihood: number | null | undefined;
  impact: number | null | undefined;
  riskScore: number | null | undefined;
  mitigationStrategy: string | null | undefined;
  notes: string | null | undefined;
  reversalReason?: string | null | undefined;
};

/**
 * Resolve a risk status by key or label (enabled preferred, then any).
 */
export function resolveRiskLifecycleStatusRef(
  config: RiskLifecycleConfig,
  raw: string | null | undefined
): RiskLifecycleStatusConfig | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLocaleLowerCase();
  const aliasKey = RISK_STATUS_ALIASES[lower];
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

export type RiskTransitionResult =
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

function hasText(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

function failMessage(gateType: RiskLifecycleGateType): string {
  return RISK_LIFECYCLE_GATE_CATALOG[gateType].description;
}

function combinedRiskScore(facts: RiskGateFacts): number | null {
  return (
    facts.riskScore ??
    (typeof facts.likelihood === "number" && typeof facts.impact === "number"
      ? facts.likelihood * facts.impact
      : null)
  );
}

/**
 * Evaluate one attached Risk check against PATCH/row facts.
 * @returns Plain-English unmet reason, or null when the check passes.
 */
export function evaluateRiskGate(
  gate: RiskLifecycleGateAttachment,
  facts: RiskGateFacts
): string | null {
  if (!gate.enabled) return null;
  switch (gate.gateType) {
    case "likelihood_impact_set":
      return typeof facts.likelihood === "number" &&
        facts.likelihood >= 1 &&
        typeof facts.impact === "number" &&
        facts.impact >= 1
        ? null
        : failMessage(gate.gateType);
    case "risk_score_calculated": {
      const score = combinedRiskScore(facts);
      return score != null && score >= 1 ? null : failMessage(gate.gateType);
    }
    case "mitigation_plan_for_high": {
      const score = combinedRiskScore(facts);
      return score == null ||
        score < RISK_HIGH_SCORE_THRESHOLD ||
        hasText(facts.mitigationStrategy)
        ? null
        : failMessage(gate.gateType);
    }
    case "acceptance_documented":
      return hasText(facts.notes) ? null : failMessage(gate.gateType);
    case "residual_risk_documented":
      return hasText(facts.notes) || hasText(facts.mitigationStrategy)
        ? null
        : failMessage(gate.gateType);
    case "reversal_reason_set":
      return hasText(facts.reversalReason) &&
        String(facts.reversalReason).trim().length >=
          MIN_RISK_OVERRIDE_REASON_LENGTH
        ? null
        : failMessage(gate.gateType);
    default:
      return `Unhandled risk check: ${String(
        (gate as { gateType: string }).gateType
      )}`;
  }
}

function effectiveEnforcement(
  transition: RiskLifecycleTransitionConfig,
  gate: RiskLifecycleGateAttachment
): "flexible" | "required" {
  if (gate.enforcement === "flexible" || gate.enforcement === "required") {
    return gate.enforcement;
  }
  return transition.enforcement;
}

/**
 * Validate a risk status change against the config graph + soft gates.
 */
export function validateRiskTransition(args: {
  config: RiskLifecycleConfig;
  fromStatus: string;
  toStatus: string;
  overrideReason?: string | null;
  facts: RiskGateFacts;
}): RiskTransitionResult {
  const from = resolveRiskLifecycleStatusRef(args.config, args.fromStatus);
  const to = resolveRiskLifecycleStatusRef(args.config, args.toStatus);
  if (!from || !to) {
    return {
      allowed: false,
      code: "UNKNOWN_STATUS",
      reason: "Status not in the risk lifecycle configuration",
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
      reason: `Status "${to.label}" is turned off in the risk lifecycle configuration`,
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
      reason: `Transition from "${from.label}" to "${to.label}" is not allowed by the risk lifecycle configuration`,
      fromKey: from.key,
      toKey: to.key,
    };
  }

  const unmetRequired: string[] = [];
  const unmetFlexible: string[] = [];
  for (const gate of transition.gates ?? []) {
    const unmet = evaluateRiskGate(gate, args.facts);
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
    if (reasonText.length < MIN_RISK_OVERRIDE_REASON_LENGTH) {
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

export type LegalNextRiskStatus = {
  key: string;
  label: string;
};

/**
 * Enabled next statuses from the current Risk status, in transition order.
 * @param config - Caller Risk lifecycle config.
 * @param fromStatus - Current status key or label.
 * @returns Legal next status key/label pairs.
 */
export function legalNextRiskStatuses(
  config: RiskLifecycleConfig,
  fromStatus: string
): LegalNextRiskStatus[] {
  const from = resolveRiskLifecycleStatusRef(config, fromStatus);
  if (!from || from.terminal || !from.enabled) return [];
  return config.transitions
    .filter((transition) => transition.enabled && transition.fromKey === from.key)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((transition) =>
      config.statuses.find(
        (status) => status.key === transition.toKey && status.enabled
      )
    )
    .filter((status): status is RiskLifecycleStatusConfig => Boolean(status))
    .map((status) => ({ key: status.key, label: status.label }));
}
