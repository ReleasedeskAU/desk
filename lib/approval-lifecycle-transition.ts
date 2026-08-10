/**
 * Pure approval decision transition validation against a lifecycle config.
 */
import type {
  ApprovalLifecycleConfig,
  ApprovalLifecycleStatusConfig,
} from "@/lib/approval-lifecycle-config";

export const MIN_APPROVAL_OVERRIDE_REASON_LENGTH = 3;

/** Legacy seed / UI labels that map onto canonical lifecycle statuses. */
const APPROVAL_STATUS_ALIASES: Readonly<Record<string, string>> = {
  "approved with conditions": "approved",
};

/**
 * Resolve an approval decision by key or label (enabled preferred, then any).
 */
export function resolveApprovalLifecycleStatusRef(
  config: ApprovalLifecycleConfig,
  raw: string | null | undefined
): ApprovalLifecycleStatusConfig | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLocaleLowerCase();
  const aliasKey = APPROVAL_STATUS_ALIASES[lower];
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

export type ApprovalTransitionResult =
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
 * Validate an approval decision change against the config graph.
 * Approved → Expired is allowed even though Approved is terminal (AV-22).
 */
export function validateApprovalTransition(args: {
  config: ApprovalLifecycleConfig;
  fromStatus: string;
  toStatus: string;
  overrideReason?: string | null;
}): ApprovalTransitionResult {
  const from = resolveApprovalLifecycleStatusRef(args.config, args.fromStatus);
  const to = resolveApprovalLifecycleStatusRef(args.config, args.toStatus);
  if (!from || !to) {
    return {
      allowed: false,
      code: "UNKNOWN_STATUS",
      reason: "Decision not in the approval lifecycle configuration",
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
  const transition = args.config.transitions.find(
    (item) =>
      item.enabled && item.fromKey === from.key && item.toKey === to.key
  );
  const isAv22Expiry =
    from.key === "approved" && to.key === "expired" && Boolean(transition);

  if (from.terminal && !isAv22Expiry) {
    return {
      allowed: false,
      code: "ILLEGAL_TRANSITION",
      reason: `Decision "${from.label}" is terminal — no further transitions are allowed`,
      fromKey: from.key,
      toKey: to.key,
    };
  }
  if (!to.enabled) {
    return {
      allowed: false,
      code: "ILLEGAL_TRANSITION",
      reason: `Decision "${to.label}" is turned off in the approval lifecycle configuration`,
      fromKey: from.key,
      toKey: to.key,
    };
  }
  if (!transition) {
    return {
      allowed: false,
      code: "ILLEGAL_TRANSITION",
      reason: `Transition from "${from.label}" to "${to.label}" is not allowed by the approval lifecycle configuration`,
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

/**
 * List enabled next decision labels from the current decision.
 */
export function listLegalNextApprovalDecisions(
  config: ApprovalLifecycleConfig,
  fromStatus: string
): string[] {
  const from = resolveApprovalLifecycleStatusRef(config, fromStatus);
  if (!from) return [];
  return config.transitions
    .filter((t) => t.enabled && t.fromKey === from.key)
    .map((t) => config.statuses.find((s) => s.key === t.toKey && s.enabled)?.label)
    .filter((label): label is string => Boolean(label));
}
