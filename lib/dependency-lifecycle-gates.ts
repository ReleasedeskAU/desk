/**
 * Fixed catalog of Dependency lifecycle checks (gates).
 *
 * Users attach known checks to transitions; runtime evaluation stays in
 * dependency-lifecycle-transition.ts and never executes user-supplied expressions.
 */

export const DEPENDENCY_LIFECYCLE_GATE_TYPES = [
  "documented_approval",
  "escalation_noted",
  "management_resolution",
] as const;

export type DependencyLifecycleGateType =
  (typeof DEPENDENCY_LIFECYCLE_GATE_TYPES)[number];

export const DEPENDENCY_LIFECYCLE_GATE_ENFORCEMENTS = [
  "inherit",
  "flexible",
  "required",
] as const;
export type DependencyLifecycleGateEnforcement =
  (typeof DEPENDENCY_LIFECYCLE_GATE_ENFORCEMENTS)[number];

export type DependencyLifecycleGateAttachment = {
  gateType: DependencyLifecycleGateType;
  enabled: boolean;
  enforcement: DependencyLifecycleGateEnforcement;
  sortOrder: number;
};

export type DependencyLifecycleGateDefinition = {
  label: string;
  description: string;
  ruleIds: readonly string[];
};

/** Catalog metadata only; runtime facts determine pass/fail. */
export const DEPENDENCY_LIFECYCLE_GATE_CATALOG: Readonly<
  Record<DependencyLifecycleGateType, DependencyLifecycleGateDefinition>
> = {
  documented_approval: {
    label: "Documented approval",
    description:
      "Notes must record the approval or justification before waiving or removing this dependency.",
    ruleIds: ["VR-36", "sheet-removed-approval"],
  },
  escalation_noted: {
    label: "Escalation reason",
    description:
      "Notes must explain why this dependency is being escalated to management.",
    ruleIds: ["sheet-escalated"],
  },
  management_resolution: {
    label: "Management resolution",
    description:
      "Notes must record the management decision before leaving Escalated for a terminal outcome.",
    ruleIds: ["sheet-escalated"],
  },
};

/**
 * True when value is a known Dependency gate type.
 * @param value - Unknown candidate from stored JSON.
 */
export function isDependencyLifecycleGateType(
  value: unknown
): value is DependencyLifecycleGateType {
  return (
    typeof value === "string" &&
    (DEPENDENCY_LIFECYCLE_GATE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Build a default attachment for one catalog check.
 * @param gateType - Catalog type.
 * @param sortOrder - Order among checks on the transition.
 */
export function dependencyGate(
  gateType: DependencyLifecycleGateType,
  sortOrder: number
): DependencyLifecycleGateAttachment {
  return {
    gateType,
    enabled: true,
    enforcement: "inherit",
    sortOrder,
  };
}
