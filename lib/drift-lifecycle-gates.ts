/**
 * Fixed catalog of Drift lifecycle checks (gates).
 * Users attach known checks to transitions; runtime never executes user expressions.
 */

export const DRIFT_LIFECYCLE_GATE_TYPES = [
  "manual_review_set",
  "eta_to_fix_set",
  "new_baseline_established",
] as const;

export type DriftLifecycleGateType = (typeof DRIFT_LIFECYCLE_GATE_TYPES)[number];

export const DRIFT_LIFECYCLE_GATE_ENFORCEMENTS = [
  "inherit",
  "flexible",
  "required",
] as const;
export type DriftLifecycleGateEnforcement =
  (typeof DRIFT_LIFECYCLE_GATE_ENFORCEMENTS)[number];

export type DriftLifecycleGateAttachment = {
  gateType: DriftLifecycleGateType;
  enabled: boolean;
  enforcement: DriftLifecycleGateEnforcement;
  sortOrder: number;
};

export type DriftLifecycleGateDefinition = {
  label: string;
  description: string;
  ruleIds: readonly string[];
};

/** Catalog metadata only; runtime facts determine pass/fail. */
export const DRIFT_LIFECYCLE_GATE_CATALOG: Readonly<
  Record<DriftLifecycleGateType, DriftLifecycleGateDefinition>
> = {
  manual_review_set: {
    label: "Manual review recorded",
    description:
      "Notes must record that someone reviewed this drift before moving to In Progress. Flexible — an exception reason can still override.",
    ruleIds: ["In Progress"],
  },
  eta_to_fix_set: {
    label: "Remediation target date",
    description:
      "ETA to Fix must be set before moving to Scheduled. Flexible — an exception reason can still override.",
    ruleIds: ["Scheduled"],
  },
  new_baseline_established: {
    label: "New baseline established",
    description:
      "Baseline notes must describe the accepted new state before marking Resolved. Flexible — an exception reason can still override.",
    ruleIds: ["Resolved"],
  },
};

/** True when value is a known Drift gate type. */
export function isDriftLifecycleGateType(
  value: unknown
): value is DriftLifecycleGateType {
  return (
    typeof value === "string" &&
    (DRIFT_LIFECYCLE_GATE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Build a default attachment for one catalog check.
 * @param gateType - Catalog type
 * @param sortOrder - Order among checks on the transition
 * @param enforcement - inherit follows the edge; required never allows override
 */
export function driftGate(
  gateType: DriftLifecycleGateType,
  sortOrder: number,
  enforcement: DriftLifecycleGateEnforcement = "inherit"
): DriftLifecycleGateAttachment {
  return {
    gateType,
    enabled: true,
    enforcement,
    sortOrder,
  };
}
