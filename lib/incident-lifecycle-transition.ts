/**
 * Pure incident status transition validation against a lifecycle config.
 * Flexible unmet soft-gates require overrideReason (warn + override).
 */
import type {
  IncidentLifecycleConfig,
  IncidentLifecycleStatusConfig,
} from "@/lib/incident-lifecycle-config";

export const MIN_INCIDENT_OVERRIDE_REASON_LENGTH = 3;

/** Legacy seed / UI labels that map onto canonical lifecycle statuses. */
const INCIDENT_STATUS_ALIASES: Readonly<Record<string, string>> = {
  active: "open",
  acknowledged: "investigating",
  mitigated: "resolving",
};

export type IncidentGateFacts = {
  severity: string | null | undefined;
  assignedTo: string | null | undefined;
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

function isCriticalSeverity(severity: string | null | undefined): boolean {
  if (!severity) return false;
  const s = severity.trim().toLowerCase();
  return (
    s === "critical" ||
    s === "p1" ||
    s.startsWith("p1 ") ||
    s.startsWith("critical") ||
    s.includes("sev-1") ||
    s.includes("sev1")
  );
}

/**
 * Soft gates for the enterprise incidents table (VR-13).
 */
export function evaluateIncidentSoftGates(args: {
  fromKey: string;
  toKey: string;
  facts: IncidentGateFacts;
}): string[] {
  const unmet: string[] = [];
  if (args.fromKey === "open" && isCriticalSeverity(args.facts.severity)) {
    if (!args.facts.assignedTo || !String(args.facts.assignedTo).trim()) {
      unmet.push(
        "Critical incidents require an owner before leaving Open. Assign someone responsible, then try again — or continue with an exception reason if your process allows it."
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

  const unmet = evaluateIncidentSoftGates({
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
    if (reasonText.length < MIN_INCIDENT_OVERRIDE_REASON_LENGTH) {
      return {
        allowed: false,
        code: "TRANSITION_NEEDS_OVERRIDE",
        reason:
          "This step needs an exception note. Some checks aren’t met. Enter a short reason (at least 3 characters) explaining why you’re allowed to continue, then try again.",
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
