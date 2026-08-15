/**
 * Pure sign-off status transition validation against a lifecycle config.
 */
import type {
  SignoffLifecycleConfig,
  SignoffLifecycleStatusConfig,
  SignoffReleaseField,
} from "@/lib/signoff-lifecycle-config";
import {
  SIGNOFF_DECISION_FIELDS,
  SIGNOFF_FIELD_LABELS,
  SIGNOFF_PRIORITY_FLOORS,
  SIGNOFF_RELEASE_FIELDS,
  SIGNOFF_SIZE_FLOORS,
  type SignoffDecisionField,
  type SignoffPriorityFloor,
  type SignoffSizeFloor,
  type SignoffTypeConfig,
} from "@/lib/signoff-lifecycle-config";

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

export type LegalNextSignoffStatus = {
  key: string;
  label: string;
};

/**
 * Enabled next sign-off statuses from the current value (graph order).
 * Required edges (SLA auto-expiry) are hidden from the Edit Release picker
 * unless `includeRequired` is set.
 *
 * @param config - Live sign-off lifecycle config.
 * @param fromStatus - Current stored value (label, key, or empty → intake).
 * @param opts.includeRequired - Include cron-only exits such as Expired.
 * @returns Legal next statuses; empty when the current decision is terminal.
 */
export function legalNextSignoffStatuses(
  config: SignoffLifecycleConfig,
  fromStatus: string | null | undefined,
  opts?: { includeRequired?: boolean }
): LegalNextSignoffStatus[] {
  const from = resolveSignoffLifecycleStatusRef(config, fromStatus);
  if (!from || !from.enabled || from.terminal) return [];
  return config.transitions
    .filter((item) => {
      if (!item.enabled || item.fromKey !== from.key) return false;
      if (!opts?.includeRequired && item.enforcement === "required") return false;
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) =>
      config.statuses.find((status) => status.enabled && status.key === item.toKey)
    )
    .filter((status): status is SignoffLifecycleStatusConfig => Boolean(status))
    .map((status) => ({ key: status.key, label: status.label }));
}

export type SignoffDecisionTypeView = {
  field: SignoffDecisionField;
  label: string;
  enabled: boolean;
  mandatory: boolean;
};

/**
 * The six sheet decision types in Settings sort order, for Edit Release.
 *
 * @param config - Live sign-off lifecycle config.
 * @returns One row per decision field (Tech Review through Operations Review).
 */
export function signoffDecisionTypesForForm(
  config: SignoffLifecycleConfig
): SignoffDecisionTypeView[] {
  const byField = new Map(
    config.types
      .filter(
        (type): type is typeof type & { releaseField: SignoffDecisionField } =>
          type.releaseField != null &&
          (SIGNOFF_DECISION_FIELDS as readonly string[]).includes(type.releaseField)
      )
      .map((type) => [type.releaseField, type] as const)
  );
  return SIGNOFF_DECISION_FIELDS.map((field) => {
    const type = byField.get(field);
    return {
      field,
      label: type?.label ?? SIGNOFF_FIELD_LABELS[field],
      enabled: type?.enabled ?? true,
      mandatory: type?.mandatory ?? false,
    };
  });
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

export type SignoffRequirementFacts = {
  releaseSize?: string | null;
  priority?: string | null;
};

function sizeRank(value: string | null | undefined): number | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "s" || normalized === "small" || normalized.startsWith("small")) {
    return 1;
  }
  if (normalized === "m" || normalized === "medium" || normalized.startsWith("medium")) {
    return 2;
  }
  if (
    normalized === "l" ||
    normalized === "xl" ||
    normalized === "large" ||
    normalized.startsWith("large")
  ) {
    return 3;
  }
  const named: Record<string, number> = { small: 1, medium: 2, large: 3 };
  return named[normalized] ?? null;
}

function priorityRank(value: string | null | undefined): number | null {
  if (value == null) return null;
  const raw = value.trim();
  if (!raw) return null;
  const p = raw.match(/\bp([1-4])\b/i);
  if (p) {
    // P1 Critical is highest rank.
    return 5 - Number(p[1]);
  }
  const lower = raw.toLowerCase();
  if (lower.includes("critical")) return 4;
  if (lower.includes("high")) return 3;
  if (lower.includes("medium")) return 2;
  if (lower.includes("low")) return 1;
  return null;
}

function meetsMinSize(
  actual: string | null | undefined,
  min: SignoffSizeFloor
): boolean {
  const have = sizeRank(actual);
  const need = sizeRank(min);
  if (have == null || need == null) return false;
  return have >= need;
}

function meetsMinPriority(
  actual: string | null | undefined,
  min: SignoffPriorityFloor
): boolean {
  const have = priorityRank(actual);
  const need = priorityRank(min);
  if (have == null || need == null) return false;
  return have >= need;
}

/**
 * Whether this sign-off type is required for the given release Size/Priority.
 * `mandatory` is always required. Otherwise Size/Priority floors apply (AND
 * when both are set). No type keys are hardcoded.
 */
export function signoffTypeRequiredForRelease(
  type: SignoffTypeConfig,
  facts: SignoffRequirementFacts = {}
): boolean {
  if (!type.enabled || !type.releaseField) return false;
  if (type.mandatory) return true;
  const sizeFloor =
    type.mandatoryMinSize &&
    (SIGNOFF_SIZE_FLOORS as readonly string[]).includes(type.mandatoryMinSize)
      ? type.mandatoryMinSize
      : null;
  const priorityFloor =
    type.mandatoryMinPriority &&
    (SIGNOFF_PRIORITY_FLOORS as readonly string[]).includes(
      type.mandatoryMinPriority
    )
      ? type.mandatoryMinPriority
      : null;
  if (!sizeFloor && !priorityFloor) return false;
  if (sizeFloor && !meetsMinSize(facts.releaseSize, sizeFloor)) return false;
  if (priorityFloor && !meetsMinPriority(facts.priority, priorityFloor)) {
    return false;
  }
  return true;
}

/**
 * Evaluate one field-specific gate while honoring that type's requirement
 * floors. Optional/disabled-for-this-release types pass; required types must
 * hold a completed decision.
 */
export function signoffFieldCompleteWhenRequired(
  config: SignoffLifecycleConfig,
  field: SignoffReleaseField,
  value: string | null | undefined,
  facts: SignoffRequirementFacts = {}
): boolean {
  const type = config.types.find(
    (candidate) => candidate.enabled && candidate.releaseField === field
  );
  if (!type) return false;
  return (
    !signoffTypeRequiredForRelease(type, facts) ||
    signoffStatusCountsAsComplete(config, value)
  );
}

/**
 * Whether every required sign-off type is complete on the release.
 * Required = Settings `mandatory` OR Size/Priority floors on the type.
 */
export function mandatorySignoffsComplete(
  config: SignoffLifecycleConfig,
  release: Partial<Record<SignoffReleaseField, string | null | undefined>> &
    SignoffRequirementFacts
): boolean {
  const required = config.types.filter((type) =>
    signoffTypeRequiredForRelease(type, {
      releaseSize: release.releaseSize,
      priority: release.priority,
    })
  );
  if (required.length === 0) return true;
  return required.every((type) =>
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
