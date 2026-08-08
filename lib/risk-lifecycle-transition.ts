/**
 * Pure risk status transition validation against a lifecycle config.
 * Flexible unmet soft-gates require overrideReason (warn + override).
 */
import {
  RISK_HIGH_SCORE_THRESHOLD,
  type RiskLifecycleConfig,
  type RiskLifecycleStatusConfig,
} from "@/lib/risk-lifecycle-config";

export const MIN_RISK_OVERRIDE_REASON_LENGTH = 3;

/** Legacy seed / UI labels that map onto canonical lifecycle statuses. */
const RISK_STATUS_ALIASES: Readonly<Record<string, string>> = {
  open: "identified",
  monitoring: "assessing",
  "in progress": "mitigating",
  in_progress: "mitigating",
};

export type RiskGateFacts = {
  likelihood: number | null | undefined;
  impact: number | null | undefined;
  riskScore: number | null | undefined;
  mitigationStrategy: string | null | undefined;
  notes: string | null | undefined;
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

/**
 * Soft score / documentation gates for the enterprise risk table.
 * Unmet flexible gates require overrideReason.
 */
export function evaluateRiskSoftGates(args: {
  fromKey: string;
  toKey: string;
  facts: RiskGateFacts;
}): string[] {
  const unmet: string[] = [];
  const score =
    args.facts.riskScore ??
    (typeof args.facts.likelihood === "number" &&
    typeof args.facts.impact === "number"
      ? args.facts.likelihood * args.facts.impact
      : null);

  if (args.fromKey === "identified") {
    const likelihoodOk =
      typeof args.facts.likelihood === "number" && args.facts.likelihood >= 1;
    const impactOk =
      typeof args.facts.impact === "number" && args.facts.impact >= 1;
    if (!likelihoodOk || !impactOk) {
      unmet.push("Probability (likelihood) and Impact are required (§1-10, §1-11)");
    }
  }

  if (args.fromKey === "assessing") {
    if (score == null || score < 1) {
      unmet.push("Risk Score must be calculated (§2-08)");
    }
  }

  if (args.fromKey === "mitigating" && args.toKey === "mitigated") {
    const high =
      (score != null && score >= RISK_HIGH_SCORE_THRESHOLD) ||
      (typeof args.facts.likelihood === "number" && args.facts.likelihood >= 4) ||
      (typeof args.facts.impact === "number" && args.facts.impact >= 4);
    if (high && !hasText(args.facts.mitigationStrategy)) {
      unmet.push("Mitigation Plan required for High severity (VR-27)");
    }
  }

  if (args.fromKey === "mitigated") {
    if (!hasText(args.facts.notes) && !hasText(args.facts.mitigationStrategy)) {
      unmet.push("Residual risk must be documented (notes or mitigation plan)");
    }
  }

  if (args.fromKey === "accepted" && args.toKey === "closed") {
    if (!hasText(args.facts.notes)) {
      unmet.push("Documented acceptance is required before closing");
    }
  }

  return unmet;
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

  const unmet = evaluateRiskSoftGates({
    fromKey: from.key,
    toKey: to.key,
    facts: args.facts,
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
    if (reasonText.length < MIN_RISK_OVERRIDE_REASON_LENGTH) {
      return {
        allowed: false,
        code: "TRANSITION_NEEDS_OVERRIDE",
        reason:
          "Transition has unmet flexible requirement(s). Provide overrideReason (min 3 characters) to proceed.",
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
