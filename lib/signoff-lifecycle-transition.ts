/**
 * Pure sign-off status transition validation against a lifecycle config.
 */
import type {
  SignoffLifecycleConfig,
  SignoffLifecycleStatusConfig,
  SignoffReleaseField,
} from "@/lib/signoff-lifecycle-config";
import { SIGNOFF_RELEASE_FIELDS } from "@/lib/signoff-lifecycle-config";

export const MIN_SIGNOFF_OVERRIDE_REASON_LENGTH = 3;

/** Legacy seed / UI labels that map onto canonical lifecycle statuses. */
const SIGNOFF_STATUS_ALIASES: Readonly<Record<string, string>> = {
  yes: "approved",
  done: "approved",
  complete: "approved",
  cleared: "approved",
  no: "rejected",
  "not started": "pending",
  todo: "pending",
  "n/a": "pending",
  na: "pending",
};

/**
 * Resolve a sign-off status by key or label (enabled preferred, then any).
 * Empty / null values resolve to Pending when that status exists.
 */
export function resolveSignoffLifecycleStatusRef(
  config: SignoffLifecycleConfig,
  raw: string | null | undefined
): SignoffLifecycleStatusConfig | null {
  if (raw == null || !String(raw).trim()) {
    return config.statuses.find((s) => s.key === "pending") ?? null;
  }
  const trimmed = String(raw).trim();
  const lower = trimmed.toLocaleLowerCase();
  const aliasKey = SIGNOFF_STATUS_ALIASES[lower];
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

export type SignoffTransitionResult =
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
 * Validate a sign-off status change against the config graph.
 * Pending → Expired is the SLA auto path (allowed when the edge exists).
 */
export function validateSignoffTransition(args: {
  config: SignoffLifecycleConfig;
  fromStatus: string | null | undefined;
  toStatus: string;
  overrideReason?: string | null;
  /**
   * §3-21: explicit supersede — open a new Pending request that replaces a
   * completed Approved / Approved with Conditions decision (not a silent flip to No).
   */
  allowSupersede?: boolean;
}): SignoffTransitionResult {
  const from = resolveSignoffLifecycleStatusRef(args.config, args.fromStatus);
  const to = resolveSignoffLifecycleStatusRef(args.config, args.toStatus);
  if (!from || !to) {
    return {
      allowed: false,
      code: "UNKNOWN_STATUS",
      reason: "Status not in the sign-off lifecycle configuration",
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
  // §3-21 rework: completed → Pending only when explicitly superseding.
  if (
    args.allowSupersede &&
    to.key === "pending" &&
    (from.key === "approved" || from.key === "approved_with_conditions")
  ) {
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
      reason: `Sign-off "${from.label}" is terminal — no further transitions are allowed`,
      fromKey: from.key,
      toKey: to.key,
    };
  }
  if (!to.enabled) {
    return {
      allowed: false,
      code: "ILLEGAL_TRANSITION",
      reason: `Sign-off "${to.label}" is turned off in the sign-off lifecycle configuration`,
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
      reason: `Transition from "${from.label}" to "${to.label}" is not allowed by the sign-off lifecycle configuration`,
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
 * Whether a stored value counts as a completed sign-off for CAB gates.
 */
export function signoffStatusCountsAsComplete(
  config: SignoffLifecycleConfig,
  status: string | null | undefined
): boolean {
  const resolved = resolveSignoffLifecycleStatusRef(config, status);
  if (!resolved) return false;
  return resolved.enabled && resolved.countsAsComplete;
}

/**
 * Whether every enabled mandatory sign-off type is complete on the release.
 */
export function mandatorySignoffsComplete(
  config: SignoffLifecycleConfig,
  release: Partial<Record<SignoffReleaseField, string | null | undefined>>
): boolean {
  const mandatory = config.types.filter(
    (t) => t.enabled && t.mandatory && t.releaseField
  );
  if (mandatory.length === 0) return true;
  return mandatory.every((type) =>
    signoffStatusCountsAsComplete(config, release[type.releaseField!])
  );
}

/**
 * Release field keys that are managed by the sign-off lifecycle.
 */
export function signoffReleaseFieldsFromConfig(
  config: SignoffLifecycleConfig
): SignoffReleaseField[] {
  const fields = config.types
    .filter((t) => t.enabled && t.releaseField)
    .map((t) => t.releaseField!);
  return [...new Set(fields)];
}

/**
 * Type guard for release sign-off field names.
 */
export function isSignoffReleaseField(key: string): key is SignoffReleaseField {
  return (SIGNOFF_RELEASE_FIELDS as readonly string[]).includes(key);
}
