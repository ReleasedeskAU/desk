/**
 * Pure incident status transition validation against a lifecycle config.
 * Flexible unmet soft-gates require overrideReason (warn + override).
 */
import type {
  IncidentLifecycleConfig,
  IncidentLifecycleStatusConfig,
  IncidentLifecycleTransitionConfig,
} from "@/lib/incident-lifecycle-config";
import {
  INCIDENT_LIFECYCLE_GATE_CATALOG,
  type IncidentLifecycleGateAttachment,
  type IncidentLifecycleGateType,
} from "@/lib/incident-lifecycle-gates";

export const MIN_INCIDENT_OVERRIDE_REASON_LENGTH = 3;

/** Legacy seed / UI labels that map onto canonical lifecycle statuses. */
const INCIDENT_STATUS_ALIASES: Readonly<Record<string, string>> = {
  active: "open",
  open: "open",
  mitigated: "resolving",
};

const CRITICAL_SEVERITY_KEYS = new Set(["p1", "p1 - critical", "critical"]);

export type IncidentGateFacts = {
  severity: string | null | undefined;
  assignedTo: string | null | undefined;
  relatedReleaseCode?: string | null | undefined;
};

/**
 * Resolve an incident status by key or label (enabled preferred, then any).
 */
export function resolveIncidentLifecycleStatusRef(
  config: IncidentLifecycleConfig,
  raw: string | null | undefined
): IncidentLifecycleStatusConfig | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLocaleLowerCase();
  const aliasKey = INCIDENT_STATUS_ALIASES[lower];
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

export type IncidentTransitionResult =
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

/**
 * True for P1 / Critical only — explicit values, not prefix matching.
 * @param severity - Stored or submitted severity label
 */
export function isCriticalIncidentSeverity(
  severity: string | null | undefined
): boolean {
  if (!severity) return false;
  return CRITICAL_SEVERITY_KEYS.has(severity.trim().toLowerCase());
}

function isPresent(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

function failMessage(gateType: IncidentLifecycleGateType): string {
  const def = INCIDENT_LIFECYCLE_GATE_CATALOG[gateType];
  switch (gateType) {
    case "responder_confirmation_set":
      return "This incident needs a responder in Assigned To before you can make that move. Assign someone, then try again — or continue with an exception reason if your process allows it.";
    case "release_link_set":
      return "Link this incident to a release in Related Release before this move, or continue with an exception reason if it is not deployment-related.";
    default:
      return def.description;
  }
}

/**
 * Evaluate one attached catalog check against PATCH/row facts.
 * @returns Unmet reason, or null when the check passes.
 */
export function evaluateIncidentGate(
  gate: IncidentLifecycleGateAttachment,
  facts: IncidentGateFacts
): string | null {
  if (!gate.enabled) return null;
  switch (gate.gateType) {
    case "responder_confirmation_set":
      return isPresent(facts.assignedTo) ? null : failMessage(gate.gateType);
    case "release_link_set":
      return isPresent(facts.relatedReleaseCode) ? null : failMessage(gate.gateType);
    default:
      return `Unhandled incident check: ${String((gate as { gateType: string }).gateType)}`;
  }
}

function effectiveEnforcement(
  transition: IncidentLifecycleTransitionConfig,
  gate: IncidentLifecycleGateAttachment
): "flexible" | "required" {
  if (gate.enforcement === "flexible" || gate.enforcement === "required") {
    return gate.enforcement;
  }
  return transition.enforcement;
}

/**
 * Soft gates for the enterprise incidents table (VR-13).
 * Owner is required when leaving the Starting status (`isIntake`), not a hardcoded "Open" key.
 */
export function evaluateIncidentSoftGates(args: {
  from: IncidentLifecycleStatusConfig;
  toKey: string;
  facts: IncidentGateFacts;
}): string[] {
  const unmet: string[] = [];
  if (args.from.isIntake && isCriticalIncidentSeverity(args.facts.severity)) {
    if (!args.facts.assignedTo || !String(args.facts.assignedTo).trim()) {
      unmet.push(
        `Critical incidents require an owner before leaving ${args.from.label}. Assign someone responsible, then try again — or continue with an exception reason if your process allows it.`
      );
    }
  }
  return unmet;
}

/**
 * Validate an incident status change against the config graph + soft gates.
 */
export function validateIncidentTransition(args: {
  config: IncidentLifecycleConfig;
  fromStatus: string;
  toStatus: string;
  overrideReason?: string | null;
  facts: IncidentGateFacts;
}): IncidentTransitionResult {
  const from = resolveIncidentLifecycleStatusRef(args.config, args.fromStatus);
  const to = resolveIncidentLifecycleStatusRef(args.config, args.toStatus);
  if (!from || !to) {
    return {
      allowed: false,
      code: "UNKNOWN_STATUS",
      reason: "Status not in the incident lifecycle configuration",
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
      reason: `Status "${to.label}" is turned off in the incident lifecycle configuration`,
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
      reason: `Transition from "${from.label}" to "${to.label}" is not allowed by the incident lifecycle configuration`,
      fromKey: from.key,
      toKey: to.key,
    };
  }

  const unmetRequired: string[] = [];
  const unmetFlexible: string[] = [];
  for (const reason of evaluateIncidentSoftGates({
    from,
    toKey: to.key,
    facts: args.facts,
  })) {
    if (transition.enforcement === "required") unmetRequired.push(reason);
    else unmetFlexible.push(reason);
  }
  for (const gate of transition.gates ?? []) {
    const unmet = evaluateIncidentGate(gate, args.facts);
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
      reason: unmetRequired.join(" "),
      unmetReasons: unmetRequired,
      fromKey: from.key,
      toKey: to.key,
    };
  }

  if (unmetFlexible.length > 0) {
    const reasonText = (args.overrideReason ?? "").trim();
    if (reasonText.length < MIN_INCIDENT_OVERRIDE_REASON_LENGTH) {
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
