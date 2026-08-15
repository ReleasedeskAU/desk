/**
 * Fixed catalog of Alert lifecycle checks (gates).
 * Users attach known checks to transitions; runtime never executes user expressions.
 */

export const ALERT_LIFECYCLE_GATE_TYPES = [
  "dismissal_justification_set",
] as const;

export type AlertLifecycleGateType = (typeof ALERT_LIFECYCLE_GATE_TYPES)[number];

export const ALERT_LIFECYCLE_GATE_ENFORCEMENTS = [
  "inherit",
  "flexible",
  "required",
] as const;
export type AlertLifecycleGateEnforcement =
  (typeof ALERT_LIFECYCLE_GATE_ENFORCEMENTS)[number];

export type AlertLifecycleGateAttachment = {
  gateType: AlertLifecycleGateType;
  enabled: boolean;
  enforcement: AlertLifecycleGateEnforcement;
  sortOrder: number;
};

export type AlertLifecycleGateDefinition = {
  label: string;
  description: string;
  ruleIds: readonly string[];
};

/** Catalog metadata only; runtime facts determine pass/fail. */
export const ALERT_LIFECYCLE_GATE_CATALOG: Readonly<
  Record<AlertLifecycleGateType, AlertLifecycleGateDefinition>
> = {
  dismissal_justification_set: {
    label: "Dismissal justification",
    description:
      "Notes must explain why this alert is being dismissed (false positive or no action needed). Flexible — an exception reason can still override.",
    ruleIds: ["Dismissed"],
  },
};

/** True when value is a known Alert gate type. */
export function isAlertLifecycleGateType(
  value: unknown
): value is AlertLifecycleGateType {
  return (
    typeof value === "string" &&
    (ALERT_LIFECYCLE_GATE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Build a default attachment for one catalog check.
 * @param gateType - Catalog type
 * @param sortOrder - Order among checks on the transition
 * @param enforcement - inherit follows the edge; required never allows override
 */
export function alertGate(
  gateType: AlertLifecycleGateType,
  sortOrder: number,
  enforcement: AlertLifecycleGateEnforcement = "inherit"
): AlertLifecycleGateAttachment {
  return {
    gateType,
    enabled: true,
    enforcement,
    sortOrder,
  };
}
