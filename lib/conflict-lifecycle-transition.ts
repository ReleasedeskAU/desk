/**
 * Pure conflict status transition validation against a lifecycle config.
 * Flexible unmet soft-gates require overrideReason (warn + override).
 */
import type {
  ConflictLifecycleConfig,
  ConflictLifecycleStatusConfig,
} from "@/lib/conflict-lifecycle-config";

export const MIN_CONFLICT_OVERRIDE_REASON_LENGTH = 3;

/** Legacy seed / UI labels that map onto canonical lifecycle statuses. */
const CONFLICT_STATUS_ALIASES: Readonly<Record<string, string>> = {
  open: "detected",
  "in progress": "under_review",
  in_progress: "under_review",
  "pending review": "under_review",
  pending_review: "under_review",
  escalated: "under_review",
  closed: "resolved",
};

export type ConflictGateFacts = {
  notes: string | null | undefined;
};

/**
 * Resolve a conflict status by key or label (enabled preferred, then any).
 */
export function resolveConflictLifecycleStatusRef(
  config: ConflictLifecycleConfig,
  raw: string | null | undefined
): ConflictLifecycleStatusConfig | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLocaleLowerCase();
  const aliasKey = CONFLICT_STATUS_ALIASES[lower];
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

export type ConflictTransitionResult =
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
 * Soft gates for the enterprise conflicts table (Dismissed needs justification).
 */
export function evaluateConflictSoftGates(args: {
  fromKey: string;
  toKey: string;
  facts: ConflictGateFacts;
}): string[] {
  const unmet: string[] = [];
  if (args.toKey === "dismissed") {
    if (!args.facts.notes || !String(args.facts.notes).trim()) {
      unmet.push("Dismissing a conflict requires justification (notes)");
    }
  }
  return unmet;
}

/**
 * Validate a conflict status change against the config graph + soft gates.
 */
export function validateConflictTransition(args: {
  config: ConflictLifecycleConfig;
  fromStatus: string;
  toStatus: string;
  overrideReason?: string | null;
  facts: ConflictGateFacts;
}): ConflictTransitionResult {
  const from = resolveConflictLifecycleStatusRef(args.config, args.fromStatus);
  const to = resolveConflictLifecycleStatusRef(args.config, args.toStatus);
  if (!from || !to) {
    return {
      allowed: false,
      code: "UNKNOWN_STATUS",
      reason: "Status not in the conflict lifecycle configuration",
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
      reason: `Status "${to.label}" is turned off in the conflict lifecycle configuration`,
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
      reason: `Transition from "${from.label}" to "${to.label}" is not allowed by the conflict lifecycle configuration`,
      fromKey: from.key,
      toKey: to.key,
    };
  }

  const unmet = evaluateConflictSoftGates({
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
    if (reasonText.length < MIN_CONFLICT_OVERRIDE_REASON_LENGTH) {
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
