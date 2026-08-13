/**
 * Pure blocker status transition validation against a lifecycle config.
 * Attached catalog checks fail closed; Flexible unmet checks need overrideReason.
 */
import type {
  BlockerLifecycleConfig,
  BlockerLifecycleStatusConfig,
  BlockerLifecycleTransitionConfig,
} from "@/lib/blocker-lifecycle-config";
import type {
  BlockerLifecycleGateAttachment,
  BlockerLifecycleGateType,
} from "@/lib/blocker-lifecycle-gates";
import { BLOCKER_LIFECYCLE_GATE_CATALOG } from "@/lib/blocker-lifecycle-gates";

export const MIN_BLOCKER_OVERRIDE_REASON_LENGTH = 3;

export type BlockerGateFacts = {
  assignedTo: string | null | undefined;
  resolutionNotes: string | null | undefined;
  rootCause: string | null | undefined;
};

export type LegalNextBlockerStatus = {
  key: string;
  label: string;
};

/**
 * Resolve a blocker status by key or label (enabled preferred, then any).
 */
export function resolveBlockerLifecycleStatusRef(
  config: BlockerLifecycleConfig,
  raw: string | null | undefined
): BlockerLifecycleStatusConfig | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const byKeyEnabled = config.statuses.find((s) => s.key === trimmed && s.enabled);
  if (byKeyEnabled) return byKeyEnabled;
  const lower = trimmed.toLocaleLowerCase();
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

export type BlockerTransitionResult =
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

function isPresent(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

function failMessage(gateType: BlockerLifecycleGateType): string {
  const def = BLOCKER_LIFECYCLE_GATE_CATALOG[gateType];
  switch (gateType) {
    case "assignee_set":
      return "This blocker needs an owner in Assigned To before you can make that move. Assign someone, then try again — or continue with an exception reason if your process allows it.";
    case "pending_reason_set":
      return "Record what you’re waiting on in Resolution notes before moving to Pending.";
    case "root_cause_set":
      return "Record the root cause before this move.";
    case "resolution_notes_set":
      return "Record resolution notes before this move.";
    default:
      return def.description;
  }
}

/**
 * Evaluate one attached catalog check against PATCH/row facts.
 * @returns Unmet reason, or null when the check passes.
 */
export function evaluateBlockerGate(
  gate: BlockerLifecycleGateAttachment,
  facts: BlockerGateFacts
): string | null {
  if (!gate.enabled) return null;
  switch (gate.gateType) {
    case "assignee_set":
      return isPresent(facts.assignedTo) ? null : failMessage(gate.gateType);
    case "pending_reason_set":
      return isPresent(facts.resolutionNotes) ? null : failMessage(gate.gateType);
    case "root_cause_set":
      return isPresent(facts.rootCause) ? null : failMessage(gate.gateType);
    case "resolution_notes_set":
      return isPresent(facts.resolutionNotes) ? null : failMessage(gate.gateType);
    default:
      return `Unhandled blocker check: ${String((gate as { gateType: string }).gateType)}`;
  }
}

function effectiveEnforcement(
  transition: BlockerLifecycleTransitionConfig,
  gate: BlockerLifecycleGateAttachment
): "flexible" | "required" {
  if (gate.enforcement === "flexible" || gate.enforcement === "required") {
    return gate.enforcement;
  }
  return transition.enforcement;
}

/**
 * Enabled next statuses from the current one, in transition sort order.
 */
export function legalNextBlockerStatuses(
  config: BlockerLifecycleConfig,
  fromStatus: string
): LegalNextBlockerStatus[] {
  const from = resolveBlockerLifecycleStatusRef(config, fromStatus);
  if (!from || from.terminal || !from.enabled) return [];
  return config.transitions
    .filter((item) => item.enabled && item.fromKey === from.key)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => config.statuses.find((s) => s.key === item.toKey && s.enabled))
    .filter((s): s is BlockerLifecycleStatusConfig => Boolean(s))
    .map((s) => ({ key: s.key, label: s.label }));
}

/**
 * Validate a blocker status change against the config graph + attached checks.
 */
export function validateBlockerTransition(args: {
  config: BlockerLifecycleConfig;
  fromStatus: string;
  toStatus: string;
  overrideReason?: string | null;
  facts: BlockerGateFacts;
}): BlockerTransitionResult {
  const from = resolveBlockerLifecycleStatusRef(args.config, args.fromStatus);
  const to = resolveBlockerLifecycleStatusRef(args.config, args.toStatus);
  if (!from || !to) {
    return {
      allowed: false,
      code: "UNKNOWN_STATUS",
      reason: "Status not in the blocker lifecycle configuration",
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
      reason: `Status "${to.label}" is turned off in the blocker lifecycle configuration`,
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
      reason: `Transition from "${from.label}" to "${to.label}" is not allowed by the blocker lifecycle configuration`,
      fromKey: from.key,
      toKey: to.key,
    };
  }

  const unmetRequired: string[] = [];
  const unmetFlexible: string[] = [];
  for (const gate of transition.gates ?? []) {
    const unmet = evaluateBlockerGate(gate, args.facts);
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
    if (reasonText.length < MIN_BLOCKER_OVERRIDE_REASON_LENGTH) {
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

/**
 * Whether a status should count as open for release Ready gating.
 */
export function blockerStatusBlocksReleaseReady(
  config: BlockerLifecycleConfig,
  status: string
): boolean {
  const resolved = resolveBlockerLifecycleStatusRef(config, status);
  if (resolved) return resolved.enabled && resolved.blocksReleaseReady;
  const s = status.toLowerCase();
  return !["resolved", "closed", "done", "mitigated", "cancelled", "canceled"].includes(s);
}
