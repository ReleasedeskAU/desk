/**
 * Fixed catalog of Dependency lifecycle checks (gates).
 *
 * Users attach these known types to transitions. Runtime evaluators live in
 * dependency-lifecycle-transition.ts. No client-supplied expressions.
 */

export const DEPENDENCY_LIFECYCLE_GATE_TYPES = [
  "both_parties_acknowledged",
  "notes_documented",
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

/**
 * Catalog metadata only — never evaluates user-supplied code.
 */
export const DEPENDENCY_LIFECYCLE_GATE_CATALOG: Readonly<
  Record<DependencyLifecycleGateType, DependencyLifecycleGateDefinition>
> = {
  both_parties_acknowledged: {
    label: "Both release managers have confirmed",
    description:
      "The owner of this release and the owner of the upstream release must each record an acknowledgment before this move (sheet: Confirmed → In Progress).",
    ruleIds: ["Confirmed"],
  },
  notes_documented: {
    label: "Documented approval in notes",
    description:
      "Notes must record why this dependency does not need to happen (sheet: Removed requires documented approval).",
    ruleIds: ["Removed"],
  },
};

/** True when value is a known Dependency gate type. */
export function isDependencyLifecycleGateType(
  value: unknown
): value is DependencyLifecycleGateType {
  return (
    typeof value === "string" &&
    (DEPENDENCY_LIFECYCLE_GATE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Default attachment for a catalog gate.
 * @param gateType - Catalog type
 * @param sortOrder - Order among attachments on that edge
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
