/**
 * Fixed catalog of Incident lifecycle checks (gates).
 *
 * Users attach these known types to transitions. Runtime evaluators live in
 * incident-lifecycle-transition.ts. No client-supplied expressions.
 */

export const INCIDENT_LIFECYCLE_GATE_TYPES = [
  "responder_confirmation_set",
  "release_link_set",
] as const;

export type IncidentLifecycleGateType =
  (typeof INCIDENT_LIFECYCLE_GATE_TYPES)[number];

export const INCIDENT_LIFECYCLE_GATE_ENFORCEMENTS = [
  "inherit",
  "flexible",
  "required",
] as const;
export type IncidentLifecycleGateEnforcement =
  (typeof INCIDENT_LIFECYCLE_GATE_ENFORCEMENTS)[number];

export type IncidentLifecycleGateAttachment = {
  gateType: IncidentLifecycleGateType;
  enabled: boolean;
  enforcement: IncidentLifecycleGateEnforcement;
  sortOrder: number;
};

export type IncidentLifecycleGateDefinition = {
  label: string;
  description: string;
  ruleIds: readonly string[];
};

/**
 * Catalog metadata only — never evaluates user-supplied code.
 */
export const INCIDENT_LIFECYCLE_GATE_CATALOG: Readonly<
  Record<IncidentLifecycleGateType, IncidentLifecycleGateDefinition>
> = {
  responder_confirmation_set: {
    label: "Responder confirmation",
    description:
      "Assigned To must be filled in before this move (sheet: responder confirmation required).",
    ruleIds: ["Acknowledged"],
  },
  release_link_set: {
    label: "Linked to a release",
    description:
      "Related Release must be set. Informational in the catalog — attach only if your process requires a deployment link.",
    ruleIds: [],
  },
};

/** True when value is a known Incident gate type. */
export function isIncidentLifecycleGateType(
  value: unknown
): value is IncidentLifecycleGateType {
  return (
    typeof value === "string" &&
    (INCIDENT_LIFECYCLE_GATE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Default attachment for a catalog gate.
 * @param gateType - Catalog type
 * @param sortOrder - Order among attachments on that edge
 */
export function incidentGate(
  gateType: IncidentLifecycleGateType,
  sortOrder: number
): IncidentLifecycleGateAttachment {
  return {
    gateType,
    enabled: true,
    enforcement: "inherit",
    sortOrder,
  };
}
