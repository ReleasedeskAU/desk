/**
 * Pure dependency status transition validation against a lifecycle config.
 * Flexible unmet soft-gates require overrideReason (warn + override).
 */
import type {
  DependencyLifecycleConfig,
  DependencyLifecycleStatusConfig,
} from "@/lib/dependency-lifecycle-config";

export const MIN_DEPENDENCY_OVERRIDE_REASON_LENGTH = 3;

/** Legacy seed / UI labels that map onto canonical lifecycle statuses. */
const DEPENDENCY_STATUS_ALIASES: Readonly<Record<string, string>> = {
  clear: "met",
  resolved: "met",
  blocked: "at_risk",
  "at risk": "at_risk",
};

export type DependencyGateFacts = {
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

/**
 * Soft gates for the enterprise dependencies table (Waived needs documentation).
 */
export function evaluateDependencySoftGates(args: {
  fromKey: string;
  toKey: string;
  facts: DependencyGateFacts;
}): string[] {
  const unmet: string[] = [];
  if (args.toKey === "waived") {
    if (!args.facts.notes || !String(args.facts.notes).trim()) {
      unmet.push("Waiving a dependency requires documented approval (notes)");
    }
  }
  return unmet;
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
  // Fail closed for unknown open-like statuses.
  const s = (status ?? "").toLowerCase();
  return ["met", "waived", "removed", "clear", "resolved"].includes(s);
}

/**
 * Validate a dependency status change against the config graph + soft gates.
 */
export function validateDependencyTransition(args: {
  config: DependencyLifecycleConfig;
  fromStatus: string;
  toStatus: string;
  overrideReason?: string | null;
  facts: DependencyGateFacts;
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
          "Transition has unmet flexible requirement(s). Provide overrideReason (min 3 characters) to proceed.",
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
