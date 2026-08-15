/**
 * Pure dependency status transition validation against a lifecycle config.
 * Flexible unmet catalog gates require overrideReason (warn + override).
 */
import type {
  DependencyLifecycleConfig,
  DependencyLifecycleStatusConfig,
  DependencyLifecycleTransitionConfig,
} from "@/lib/dependency-lifecycle-config";
import {
  DEPENDENCY_LIFECYCLE_GATE_CATALOG,
  type DependencyLifecycleGateAttachment,
  type DependencyLifecycleGateType,
} from "@/lib/dependency-lifecycle-gates";
import {
  enabledStatusMatchValues,
  reportLifecycleRoleFault,
  resolveExclusiveRole,
  type LifecycleRoleFault,
} from "@/lib/lifecycle-status-roles";

export const MIN_DEPENDENCY_OVERRIDE_REASON_LENGTH = 3;

/** Legacy seed / UI labels that map onto canonical lifecycle statuses. */
const DEPENDENCY_STATUS_ALIASES: Readonly<Record<string, string>> = {
  clear: "met",
  resolved: "met",
  "at risk": "at_risk",
  "in progress": "in_progress",
};

export type DependencyGateFacts = {
  notes: string | null | undefined;
};

export type LegalNextDependencyStatus = {
  key: string;
  label: string;
};

/**
 * Resolve a dependency status by key or label (enabled preferred, then any).
 */
export function resolveDependencyLifecycleStatusRef(
  config: DependencyLifecycleConfig,
  raw: string | null | undefined
): DependencyLifecycleStatusConfig | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLocaleLowerCase();
  const aliasKey = DEPENDENCY_STATUS_ALIASES[lower];
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

export type DependencyTransitionResult =
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

function hasText(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

function failMessage(gateType: DependencyLifecycleGateType): string {
  return DEPENDENCY_LIFECYCLE_GATE_CATALOG[gateType].description;
}

/**
 * Evaluate one attached Dependency check against PATCH/row facts.
 * @returns Plain-English unmet reason, or null when the check passes.
 */
export function evaluateDependencyGate(
  gate: DependencyLifecycleGateAttachment,
  facts: DependencyGateFacts
): string | null {
  if (!gate.enabled) return null;
  switch (gate.gateType) {
    case "documented_approval":
    case "escalation_noted":
    case "management_resolution":
      return hasText(facts.notes) ? null : failMessage(gate.gateType);
    default:
      return `Unhandled dependency check: ${String(
        (gate as { gateType: string }).gateType
      )}`;
  }
}

function effectiveEnforcement(
  transition: DependencyLifecycleTransitionConfig,
  gate: DependencyLifecycleGateAttachment
): "flexible" | "required" {
  if (gate.enforcement === "flexible" || gate.enforcement === "required") {
    return gate.enforcement;
  }
  return transition.enforcement;
}

/**
 * Whether a status satisfies the Hard-dependency Deploying gate (VR-18).
 * Includes legacy Clear/Resolved via aliases.
 */
export function dependencyStatusSatisfiesHardGate(
  config: DependencyLifecycleConfig,
  status: string | null | undefined
): boolean {
  const resolved = resolveDependencyLifecycleStatusRef(config, status);
  if (resolved) return resolved.enabled && resolved.satisfiesHardGate;
  const s = (status ?? "").toLowerCase();
  return ["met", "waived", "removed", "clear", "resolved"].includes(s);
}

/**
 * Enabled next statuses from the live graph (edit dropdown).
 * @param config - Caller's dependency lifecycle config.
 * @param fromStatus - Current status key or label.
 */
export function legalNextDependencyStatuses(
  config: DependencyLifecycleConfig,
  fromStatus: string
): LegalNextDependencyStatus[] {
  const from = resolveDependencyLifecycleStatusRef(config, fromStatus);
  if (!from || from.terminal || !from.enabled) return [];
  return config.transitions
    .filter((item) => item.enabled && item.fromKey === from.key)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) =>
      config.statuses.find((status) => status.key === item.toKey && status.enabled)
    )
    .filter((status): status is DependencyLifecycleStatusConfig => Boolean(status))
    .map((status) => ({ key: status.key, label: status.label }));
}

/**
 * Resolve AV-26 source labels and exclusive warning dest from the live graph.
 * @param config - Caller's dependency lifecycle config.
 */
export function resolveDependencyRollbackCascade(config: DependencyLifecycleConfig):
  | {
      ok: true;
      sourceValues: string[];
      dest: DependencyLifecycleStatusConfig;
    }
  | { ok: false; fault: LifecycleRoleFault } {
  const dest = resolveExclusiveRole(
    config.statuses,
    (s) => s.rollbackWarningTarget,
    "rollbackWarningTarget",
    "AV-26"
  );
  if (!dest.ok) {
    reportLifecycleRoleFault(dest.fault);
    return dest;
  }
  const sources = config.statuses.filter(
    (s) => s.enabled && s.reopensOnPredecessorRollback
  );
  if (sources.length === 0) {
    const missing = resolveExclusiveRole(
      config.statuses,
      (s) => s.reopensOnPredecessorRollback,
      "reopensOnPredecessorRollback",
      "AV-26"
    );
    if (!missing.ok) {
      reportLifecycleRoleFault(missing.fault);
      return missing;
    }
  }
  return {
    ok: true,
    sourceValues: enabledStatusMatchValues(
      config.statuses,
      (s) => s.reopensOnPredecessorRollback
    ),
    dest: dest.status,
  };
}

/**
 * Validate a dependency status change against the config graph + catalog gates.
 *
 * AV-26 system exception: a status flagged “reopen on predecessor rollback”
 * may move to the rollback-warning status only when `isSystemTransition: true`.
 * User PATCH must never set that flag — Met stays terminal for normal edits.
 */
export function validateDependencyTransition(args: {
  config: DependencyLifecycleConfig;
  fromStatus: string;
  toStatus: string;
  overrideReason?: string | null;
  facts: DependencyGateFacts;
  /**
   * System automation marker (AV-26). When true, allows the role-flagged
   * reopen path despite the source being terminal. Never accept this from
   * client input.
   */
  isSystemTransition?: boolean;
}): DependencyTransitionResult {
  const from = resolveDependencyLifecycleStatusRef(args.config, args.fromStatus);
  const to = resolveDependencyLifecycleStatusRef(args.config, args.toStatus);
  if (!from || !to) {
    return {
      allowed: false,
      code: "UNKNOWN_STATUS",
      reason: "Status not in the dependency lifecycle configuration",
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

  const isAv26SystemReopen =
    Boolean(args.isSystemTransition) &&
    from.reopensOnPredecessorRollback &&
    to.rollbackWarningTarget;
  if (isAv26SystemReopen) {
    if (!to.enabled) {
      return {
        allowed: false,
        code: "ILLEGAL_TRANSITION",
        reason: `Status "${to.label}" is turned off in the dependency lifecycle configuration`,
        fromKey: from.key,
        toKey: to.key,
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
      reason: `Status "${to.label}" is turned off in the dependency lifecycle configuration`,
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
      reason: `Transition from "${from.label}" to "${to.label}" is not allowed by the dependency lifecycle configuration`,
      fromKey: from.key,
      toKey: to.key,
    };
  }

  const unmetRequired: string[] = [];
  const unmetFlexible: string[] = [];
  for (const gate of transition.gates ?? []) {
    const unmet = evaluateDependencyGate(gate, args.facts);
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
      reason: unmetRequired.join("; "),
      unmetReasons: unmetRequired,
      fromKey: from.key,
      toKey: to.key,
    };
  }
  if (unmetFlexible.length > 0) {
    const reasonText = (args.overrideReason ?? "").trim();
    if (reasonText.length < MIN_DEPENDENCY_OVERRIDE_REASON_LENGTH) {
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
