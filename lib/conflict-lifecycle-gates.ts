/**
 * Fixed catalog of Conflict lifecycle checks (gates).
 *
 * Users attach known checks to transitions; runtime evaluation stays in
 * conflict-lifecycle-transition.ts and never executes user-supplied expressions.
 */

export const CONFLICT_LIFECYCLE_GATE_TYPES = [
  "rm_assessment_set",
  "higher_authority_decision_set",
  "dismissal_justification_set",
] as const;

export type ConflictLifecycleGateType =
  (typeof CONFLICT_LIFECYCLE_GATE_TYPES)[number];

export const CONFLICT_LIFECYCLE_GATE_ENFORCEMENTS = [
  "inherit",
  "flexible",
  "required",
] as const;
export type ConflictLifecycleGateEnforcement =
  (typeof CONFLICT_LIFECYCLE_GATE_ENFORCEMENTS)[number];

export type ConflictLifecycleGateAttachment = {
  gateType: ConflictLifecycleGateType;
  enabled: boolean;
  enforcement: ConflictLifecycleGateEnforcement;
  sortOrder: number;
};

export type ConflictLifecycleGateDefinition = {
  label: string;
  description: string;
  ruleIds: readonly string[];
};

/** Catalog metadata only; runtime facts determine pass/fail. */
export const CONFLICT_LIFECYCLE_GATE_CATALOG: Readonly<
  Record<ConflictLifecycleGateType, ConflictLifecycleGateDefinition>
> = {
  rm_assessment_set: {
    label: "Release Manager assessment",
    description:
      "Assigned To must name the person who assessed this conflict before this move.",
    ruleIds: ["In Progress"],
  },
  higher_authority_decision_set: {
    label: "Higher-authority decision",
    description:
      "Notes must record the senior decision before leaving Escalated.",
    ruleIds: ["Escalated"],
  },
  dismissal_justification_set: {
    label: "Dismissal justification",
    description:
      "Notes must explain why this conflict is being dismissed. This check cannot be overridden.",
    ruleIds: ["Dismissed"],
  },
};

/** True when value is a known Conflict gate type. */
export function isConflictLifecycleGateType(
  value: unknown
): value is ConflictLifecycleGateType {
  return (
    typeof value === "string" &&
    (CONFLICT_LIFECYCLE_GATE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Build a default attachment for one catalog check.
 * @param gateType - Catalog type.
 * @param sortOrder - Order among checks on the transition.
 * @param enforcement - inherit follows the edge; required never allows override.
 */
export function conflictGate(
  gateType: ConflictLifecycleGateType,
  sortOrder: number,
  enforcement: ConflictLifecycleGateEnforcement = "inherit"
): ConflictLifecycleGateAttachment {
  return {
    gateType,
    enabled: true,
    enforcement,
    sortOrder,
  };
}
