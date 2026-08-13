/**
 * Fixed catalog of Blocker lifecycle checks (gates).
 *
 * Users attach these known types to transitions. Runtime evaluators live in
 * blocker-lifecycle-transition.ts. No client-supplied expressions.
 */

export const BLOCKER_LIFECYCLE_GATE_TYPES = [
  "assignee_set",
  "pending_reason_set",
  "root_cause_set",
  "resolution_notes_set",
] as const;

export type BlockerLifecycleGateType =
  (typeof BLOCKER_LIFECYCLE_GATE_TYPES)[number];

export const BLOCKER_LIFECYCLE_GATE_ENFORCEMENTS = [
  "inherit",
  "flexible",
  "required",
] as const;
export type BlockerLifecycleGateEnforcement =
  (typeof BLOCKER_LIFECYCLE_GATE_ENFORCEMENTS)[number];

export type BlockerLifecycleGateAttachment = {
  gateType: BlockerLifecycleGateType;
  enabled: boolean;
  enforcement: BlockerLifecycleGateEnforcement;
  sortOrder: number;
};

export type BlockerLifecycleGateDefinition = {
  label: string;
  description: string;
  ruleIds: readonly string[];
};

/**
 * Catalog metadata only — never evaluates user-supplied code.
 */
export const BLOCKER_LIFECYCLE_GATE_CATALOG: Readonly<
  Record<BlockerLifecycleGateType, BlockerLifecycleGateDefinition>
> = {
  assignee_set: {
    label: "Owner assigned",
    description:
      "Assigned To must be filled in before this move (sheet: owner assignment required).",
    ruleIds: ["Assigned"],
  },
  pending_reason_set: {
    label: "Waiting-on note recorded",
    description:
      "Resolution notes must explain what external input this blocker is waiting on.",
    ruleIds: ["Pending"],
  },
  root_cause_set: {
    label: "Root cause recorded",
    description: "Root cause must be filled in before this move.",
    ruleIds: [],
  },
  resolution_notes_set: {
    label: "Resolution notes recorded",
    description: "Resolution notes must be filled in before this move.",
    ruleIds: [],
  },
};

/** True when value is a known Blocker gate type. */
export function isBlockerLifecycleGateType(
  value: unknown
): value is BlockerLifecycleGateType {
  return (
    typeof value === "string" &&
    (BLOCKER_LIFECYCLE_GATE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Default attachment for a catalog gate.
 * @param gateType - Catalog type
 * @param sortOrder - Order among attachments on that edge
 */
export function blockerGate(
  gateType: BlockerLifecycleGateType,
  sortOrder: number
): BlockerLifecycleGateAttachment {
  return {
    gateType,
    enabled: true,
    enforcement: "inherit",
    sortOrder,
  };
}
