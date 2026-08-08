/**
 * Pure blocker status transition validation against a lifecycle config.
 */
import type {
  BlockerLifecycleConfig,
  BlockerLifecycleStatusConfig,
} from "@/lib/blocker-lifecycle-config";

export const MIN_BLOCKER_OVERRIDE_REASON_LENGTH = 3;

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
    }
  | {
      allowed: false;
      code: "UNKNOWN_STATUS" | "ILLEGAL_TRANSITION" | "TRANSITION_NEEDS_OVERRIDE";
      reason: string;
      fromKey?: string;
      toKey?: string;
    };

/**
 * Validate a blocker status change against the config graph.
 */
export function validateBlockerTransition(args: {
  config: BlockerLifecycleConfig;
  fromStatus: string;
  toStatus: string;
  overrideReason?: string | null;
}): BlockerTransitionResult {
  const from = resolveBlockerLifecycleStatusRef(args.config, args.fromStatus);
  const to = resolveBlockerLifecycleStatusRef(args.config, args.toStatus);
  if (!from || !to) {
    return {
      allowed: false,
      code: "UNKNOWN_STATUS",
      reason: `Status not in the blocker lifecycle configuration`,
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
  // Flexible edges may warn via override; Required edges have no soft gates today —
  // Required on Closed/Cancelled is expressed as terminal (no outgoing).
  if (transition.enforcement === "flexible") {
    // No gate catalog yet — always allow when edge exists.
    return {
      allowed: true,
      overridden: false,
      fromKey: from.key,
      toKey: to.key,
      canonicalStatus: to.label,
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
  // Fail closed for unknown open-like statuses.
  const s = status.toLowerCase();
  return !["resolved", "closed", "done", "mitigated", "cancelled", "canceled"].includes(s);
}
