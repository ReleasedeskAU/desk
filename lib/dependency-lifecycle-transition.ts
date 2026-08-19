/**
 * Pure dependency status transition validation against a lifecycle config.
 * Flexible unmet catalog checks require overrideReason (warn + override).
 */
import type {
  DependencyLifecycleConfig,
  DependencyLifecycleStatusConfig,
} from "@/lib/dependency-lifecycle-config";
import type {
  DependencyLifecycleGateAttachment,
  DependencyLifecycleGateType,
} from "@/lib/dependency-lifecycle-gates";
import { DEPENDENCY_LIFECYCLE_GATE_CATALOG } from "@/lib/dependency-lifecycle-gates";
import {
  bothDependencyPartiesAcknowledged,
  type DependencyAckState,
} from "@/lib/dependency-ack";

export const MIN_DEPENDENCY_OVERRIDE_REASON_LENGTH = 3;

/**
 * Legacy labels/keys that map onto canonical lifecycle statuses.
 * Do not alias real sheet keys (`resolved`, `blocked`) — they are first-class.
 */
const DEPENDENCY_STATUS_ALIASES: Readonly<Record<string, string>> = {
  clear: "resolved",
  met: "resolved",
  waived: "removed",
  "at risk": "at_risk",
  "in progress": "in_progress",
};

export type DependencyGateFacts = DependencyAckState & {
  notes: string | null | undefined;
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

function failMessage(gateType: DependencyLifecycleGateType): string {
  return DEPENDENCY_LIFECYCLE_GATE_CATALOG[gateType].description;
}

/**
 * Evaluate one attached catalog check. Returns a user-facing reason when unmet.
 */
export function evaluateDependencyGate(
  gate: DependencyLifecycleGateAttachment,
  facts: DependencyGateFacts
): string | null {
  if (!gate.enabled) return null;
  switch (gate.gateType) {
    case "notes_documented":
      return facts.notes && String(facts.notes).trim()
        ? null
        : failMessage(gate.gateType);
    case "both_parties_acknowledged":
      return bothDependencyPartiesAcknowledged(facts)
        ? null
        : failMessage(gate.gateType);
    default:
      return `Unhandled dependency check: ${String((gate as { gateType: string }).gateType)}`;
  }
}

/**
 * Soft gates for the attached catalog on this edge.
 */
export function evaluateDependencySoftGates(args: {
  fromKey: string;
  toKey: string;
  facts: DependencyGateFacts;
  gates: DependencyLifecycleGateAttachment[] | undefined;
}): string[] {
  const unmet: string[] = [];
  for (const gate of args.gates ?? []) {
    const reason = evaluateDependencyGate(gate, args.facts);
    if (reason) unmet.push(reason);
  }
  return unmet;
}

/**
 * Whether a status satisfies the Hard-dependency Deploying gate (VR-18).
 * Resolved / Removed / Closed count as handled; Closed is archive, not a reopen.
 * Legacy Clear / Met / Waived still resolve via aliases.
 */
export function dependencyStatusSatisfiesHardGate(
  config: DependencyLifecycleConfig,
  status: string | null | undefined
): boolean {
  const resolved = resolveDependencyLifecycleStatusRef(config, status);
  if (resolved) return resolved.enabled && resolved.satisfiesHardGate;
  const s = (status ?? "").toLowerCase();
  return ["met", "waived", "removed", "clear", "resolved", "closed"].includes(s);
}

function isAv26SystemRollback(
  config: DependencyLifecycleConfig,
  from: DependencyLifecycleStatusConfig,
  to: DependencyLifecycleStatusConfig
): boolean {
  return Boolean(from.rollbackReopensAtRisk && to.atRiskWarning);
}

export type DependencyTransitionArgs = {
  config: DependencyLifecycleConfig;
  fromStatus: string;
  toStatus: string;
  overrideReason?: string | null;
  facts: DependencyGateFacts;
  /**
   * System automation marker (AV-26). When true, allows Resolved → At Risk
   * despite that edge not being on the user graph. Never accept from client input.
   */
  isSystemTransition?: boolean;
};

/**
 * Validate a dependency status change against the config graph + catalog checks.
 */
export function validateDependencyTransition(
  args: DependencyTransitionArgs
): DependencyTransitionResult {
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

  if (
    Boolean(args.isSystemTransition) &&
    isAv26SystemRollback(args.config, from, to)
  ) {
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

  const unmet = evaluateDependencySoftGates({
    fromKey: from.key,
    toKey: to.key,
    facts: args.facts,
    gates: transition.gates,
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
    if (reasonText.length < MIN_DEPENDENCY_OVERRIDE_REASON_LENGTH) {
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
