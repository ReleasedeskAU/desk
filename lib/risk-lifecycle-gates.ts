/**
 * Fixed catalog of Risk lifecycle checks (gates).
 *
 * Users attach known checks to transitions; runtime evaluation stays in
 * risk-lifecycle-transition.ts and never executes user-supplied expressions.
 */

export const RISK_LIFECYCLE_GATE_TYPES = [
  "likelihood_impact_set",
  "risk_score_calculated",
  "mitigation_plan_for_high",
  "acceptance_documented",
  "residual_risk_documented",
  "reversal_reason_set",
] as const;

export type RiskLifecycleGateType = (typeof RISK_LIFECYCLE_GATE_TYPES)[number];

export const RISK_LIFECYCLE_GATE_ENFORCEMENTS = [
  "inherit",
  "flexible",
  "required",
] as const;
export type RiskLifecycleGateEnforcement =
  (typeof RISK_LIFECYCLE_GATE_ENFORCEMENTS)[number];

export type RiskLifecycleGateAttachment = {
  gateType: RiskLifecycleGateType;
  enabled: boolean;
  enforcement: RiskLifecycleGateEnforcement;
  sortOrder: number;
};

export type RiskLifecycleGateDefinition = {
  label: string;
  description: string;
  ruleIds: readonly string[];
};

/** Catalog metadata only; runtime facts determine pass/fail. */
export const RISK_LIFECYCLE_GATE_CATALOG: Readonly<
  Record<RiskLifecycleGateType, RiskLifecycleGateDefinition>
> = {
  likelihood_impact_set: {
    label: "Probability and impact",
    description: "Likelihood and Impact must both be set before this move.",
    ruleIds: ["§1-10", "§1-11"],
  },
  risk_score_calculated: {
    label: "Risk score calculated",
    description: "A positive combined risk score must be available before this move.",
    ruleIds: ["§2-08"],
  },
  mitigation_plan_for_high: {
    label: "High-risk mitigation plan",
    description:
      "Risks scoring 15 or higher need a mitigation plan before leaving Mitigating.",
    ruleIds: ["VR-27"],
  },
  acceptance_documented: {
    label: "Acceptance documented",
    description: "Acceptance notes must be recorded before entering Accepted.",
    ruleIds: ["VR-27"],
  },
  residual_risk_documented: {
    label: "Residual risk documented",
    description:
      "Notes or a mitigation plan must document the residual risk before leaving Monitoring.",
    ruleIds: ["VR-27"],
  },
  reversal_reason_set: {
    label: "Reversal reason",
    description:
      "A reason is mandatory when reversing Accepted or Monitoring back to Mitigating.",
    ruleIds: ["VR-27"],
  },
};

/** True when value is a known Risk gate type. */
export function isRiskLifecycleGateType(
  value: unknown
): value is RiskLifecycleGateType {
  return (
    typeof value === "string" &&
    (RISK_LIFECYCLE_GATE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Build a default attachment for one catalog check.
 * @param gateType - Catalog type.
 * @param sortOrder - Order among checks on the transition.
 */
export function riskGate(
  gateType: RiskLifecycleGateType,
  sortOrder: number
): RiskLifecycleGateAttachment {
  return {
    gateType,
    enabled: true,
    enforcement: "inherit",
    sortOrder,
  };
}
