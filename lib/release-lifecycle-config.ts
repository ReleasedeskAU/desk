/**
 * Per-user Release lifecycle configuration.
 *
 * Defaults encode the locked 15-status vocabulary and reviewed transition
 * graph. Storage is keyed by Clerk user id now and shaped for organization
 * scoping later.
 */
import {
  isReleaseLifecycleGateType,
  validateReleaseLifecycleGateParams,
  type ReleaseLifecycleGateType,
} from "@/lib/release-lifecycle-gates";

export const RELEASE_LIFECYCLE_STATUS_KINDS = [
  "mainline",
  "branch",
  "interrupt",
  "terminal",
] as const;
export type ReleaseLifecycleStatusKind =
  (typeof RELEASE_LIFECYCLE_STATUS_KINDS)[number];

export const RELEASE_LIFECYCLE_ENFORCEMENTS = [
  "flexible",
  "required",
] as const;
export type ReleaseLifecycleEnforcement =
  (typeof RELEASE_LIFECYCLE_ENFORCEMENTS)[number];

export const RELEASE_LIFECYCLE_GATE_ENFORCEMENTS = [
  "inherit",
  "flexible",
  "required",
] as const;
export type ReleaseLifecycleGateEnforcement =
  (typeof RELEASE_LIFECYCLE_GATE_ENFORCEMENTS)[number];

export const RELEASE_EDIT_MODES = [
  "full",
  "limited",
  "read_only",
  "immutable",
] as const;
export type ReleaseEditMode = (typeof RELEASE_EDIT_MODES)[number];

/**
 * Sheet “Editable?” column defaults. Deployed is Limited (not view-only).
 * Used when a stored snapshot predates `editMode`.
 *
 * @param key - Status key (e.g. deployed).
 * @returns Edit mode for that key.
 */
export function defaultReleaseEditModeForStatusKey(key: string): ReleaseEditMode {
  switch (key) {
    case "closed":
    case "cancelled":
      return "immutable";
    case "deploying":
      return "read_only";
    case "pending_cab":
    case "cab_approved":
    case "ready_to_deploy":
    case "deployed":
      return "limited";
    default:
      return "full";
  }
}

/** True when a value is a known Release edit-mode token. */
export function isReleaseEditMode(value: unknown): value is ReleaseEditMode {
  return (
    typeof value === "string" &&
    (RELEASE_EDIT_MODES as readonly string[]).includes(value)
  );
}

export type ReleaseLifecycleStatusConfig = {
  key: string;
  label: string;
  sortOrder: number;
  terminal: boolean;
  kind: ReleaseLifecycleStatusKind;
  isSystem: boolean;
  enabled: boolean;
  /** Sheet Editable? column — configurable on Statuses tab. */
  editMode: ReleaseEditMode;
  /** New records land here. */
  isIntake: boolean;
  /** This stage and later freeze the dependency list (VR-36). */
  readyMilestone: boolean;
  /** This stage and later lock bookings / new blockers (VR-35, §3-06). */
  deployingMilestone: boolean;
  /** Entering this status marks matching dependencies Met (AV-04). */
  deployedMilestone: boolean;
  /** Entering this status withdraws open CAB approvals (CASC-13). */
  withdrawApprovalsOnEnter: boolean;
  /** Entering this status writes the CAB scope snapshot (VR-21). */
  writesCabScopeSnapshot: boolean;
  /** Entering this status clears the CAB scope snapshot (VR-21 revert). */
  clearsCabScopeSnapshot: boolean;
  /** Linked release lands here when an approval decision reverts it. */
  approvalRejectLanding: boolean;
  /** Entering this status flags matching met dependencies At Risk (AV-26). */
  rollbackMilestone: boolean;
};

const EMPTY_RELEASE_ROLES = {
  isIntake: false,
  readyMilestone: false,
  deployingMilestone: false,
  deployedMilestone: false,
  withdrawApprovalsOnEnter: false,
  writesCabScopeSnapshot: false,
  clearsCabScopeSnapshot: false,
  approvalRejectLanding: false,
  rollbackMilestone: false,
} as const;

/**
 * Enterprise-default roles for a release status key (seed / fill-missing only).
 * Runtime must read the flags on the live status object, not call this.
 */
export function defaultReleaseStatusRoles(
  key: string
): Pick<
  ReleaseLifecycleStatusConfig,
  | "isIntake"
    | "readyMilestone"
    | "deployingMilestone"
    | "deployedMilestone"
    | "withdrawApprovalsOnEnter"
    | "writesCabScopeSnapshot"
    | "clearsCabScopeSnapshot"
    | "approvalRejectLanding"
    | "rollbackMilestone"
> {
  return {
    isIntake: key === "draft",
    readyMilestone: key === "ready_to_deploy",
    deployingMilestone: key === "deploying",
    deployedMilestone: key === "deployed",
    withdrawApprovalsOnEnter: key === "cancelled",
    writesCabScopeSnapshot: key === "cab_approved",
    clearsCabScopeSnapshot: key === "pending_cab",
    approvalRejectLanding: key === "planning",
    rollbackMilestone: key === "rolled_back",
  };
}

/**
 * Fill role flags on a stored release status (explicit false/null kept).
 */
export function withReleaseStatusRoles(
  status: Omit<
    ReleaseLifecycleStatusConfig,
    | "isIntake"
    | "readyMilestone"
    | "deployingMilestone"
    | "deployedMilestone"
    | "withdrawApprovalsOnEnter"
    | "writesCabScopeSnapshot"
    | "clearsCabScopeSnapshot"
    | "approvalRejectLanding"
    | "rollbackMilestone"
  > &
    Partial<
      Pick<
        ReleaseLifecycleStatusConfig,
        | "isIntake"
        | "readyMilestone"
        | "deployingMilestone"
        | "deployedMilestone"
        | "withdrawApprovalsOnEnter"
        | "writesCabScopeSnapshot"
        | "clearsCabScopeSnapshot"
        | "approvalRejectLanding"
        | "rollbackMilestone"
      >
    >
): ReleaseLifecycleStatusConfig {
  const fallback = defaultReleaseStatusRoles(status.key);
  return {
    ...EMPTY_RELEASE_ROLES,
    ...status,
    isIntake:
      typeof status.isIntake === "boolean" ? status.isIntake : fallback.isIntake,
    readyMilestone:
      typeof status.readyMilestone === "boolean"
        ? status.readyMilestone
        : fallback.readyMilestone,
    deployingMilestone:
      typeof status.deployingMilestone === "boolean"
        ? status.deployingMilestone
        : fallback.deployingMilestone,
    deployedMilestone:
      typeof status.deployedMilestone === "boolean"
        ? status.deployedMilestone
        : fallback.deployedMilestone,
    withdrawApprovalsOnEnter:
      typeof status.withdrawApprovalsOnEnter === "boolean"
        ? status.withdrawApprovalsOnEnter
        : fallback.withdrawApprovalsOnEnter,
    writesCabScopeSnapshot:
      typeof status.writesCabScopeSnapshot === "boolean"
        ? status.writesCabScopeSnapshot
        : fallback.writesCabScopeSnapshot,
    clearsCabScopeSnapshot:
      typeof status.clearsCabScopeSnapshot === "boolean"
        ? status.clearsCabScopeSnapshot
        : fallback.clearsCabScopeSnapshot,
    approvalRejectLanding:
      typeof status.approvalRejectLanding === "boolean"
        ? status.approvalRejectLanding
        : fallback.approvalRejectLanding,
    rollbackMilestone:
      typeof status.rollbackMilestone === "boolean"
        ? status.rollbackMilestone
        : fallback.rollbackMilestone,
  };
}

export type ReleaseLifecycleGateAttachment = {
  gateType: ReleaseLifecycleGateType;
  enabled: boolean;
  enforcement: ReleaseLifecycleGateEnforcement;
  params?: Record<string, unknown>;
  sortOrder: number;
};

export type ReleaseLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string | null;
  isPreviousStatus: boolean;
  enabled: boolean;
  enforcement: ReleaseLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
  gates: ReleaseLifecycleGateAttachment[];
};

export type ReleaseLifecycleConfig = {
  statuses: ReleaseLifecycleStatusConfig[];
  transitions: ReleaseLifecycleTransitionConfig[];
};

export const MAX_RELEASE_LIFECYCLE_STATUSES = 30;
export const MAX_RELEASE_LIFECYCLE_TRANSITIONS = 200;
export const PREVIOUS_STATUS_TARGET_KEY = "__previous__";

/** Locked default status vocabulary and display order (roles filled on seed). */
export const DEFAULT_RELEASE_LIFECYCLE_STATUSES: readonly Omit<
  ReleaseLifecycleStatusConfig,
  | "isIntake"
  | "readyMilestone"
  | "deployingMilestone"
  | "deployedMilestone"
  | "withdrawApprovalsOnEnter"
  | "writesCabScopeSnapshot"
  | "clearsCabScopeSnapshot"
  | "approvalRejectLanding"
  | "rollbackMilestone"
>[] = [
  { key: "draft", label: "Draft", sortOrder: 10, terminal: false, kind: "mainline", isSystem: true, enabled: true, editMode: "full" },
  { key: "planning", label: "Planning", sortOrder: 20, terminal: false, kind: "mainline", isSystem: true, enabled: true, editMode: "full" },
  { key: "testing", label: "Testing", sortOrder: 30, terminal: false, kind: "mainline", isSystem: true, enabled: true, editMode: "full" },
  { key: "uat", label: "UAT", sortOrder: 40, terminal: false, kind: "mainline", isSystem: true, enabled: true, editMode: "full" },
  { key: "pending_cab", label: "Pending CAB", sortOrder: 50, terminal: false, kind: "mainline", isSystem: true, enabled: true, editMode: "limited" },
  { key: "cab_approved", label: "CAB Approved", sortOrder: 60, terminal: false, kind: "mainline", isSystem: true, enabled: true, editMode: "limited" },
  { key: "ready_to_deploy", label: "Ready to deploy", sortOrder: 70, terminal: false, kind: "mainline", isSystem: true, enabled: true, editMode: "limited" },
  { key: "deploying", label: "Deploying", sortOrder: 80, terminal: false, kind: "mainline", isSystem: true, enabled: true, editMode: "read_only" },
  { key: "deployed", label: "Deployed", sortOrder: 90, terminal: false, kind: "mainline", isSystem: true, enabled: true, editMode: "limited" },
  { key: "closed", label: "Closed", sortOrder: 100, terminal: true, kind: "terminal", isSystem: true, enabled: true, editMode: "immutable" },
  { key: "cancelled", label: "Cancelled", sortOrder: 110, terminal: true, kind: "terminal", isSystem: true, enabled: true, editMode: "immutable" },
  { key: "blocked", label: "Blocked", sortOrder: 120, terminal: false, kind: "interrupt", isSystem: true, enabled: true, editMode: "full" },
  { key: "rolled_back", label: "Rolled Back", sortOrder: 130, terminal: false, kind: "interrupt", isSystem: true, enabled: true, editMode: "full" },
  { key: "deferred", label: "Deferred", sortOrder: 140, terminal: false, kind: "branch", isSystem: true, enabled: true, editMode: "full" },
  { key: "rejected", label: "Rejected", sortOrder: 150, terminal: false, kind: "branch", isSystem: true, enabled: true, editMode: "full" },
];

function gate(
  gateType: ReleaseLifecycleGateType,
  sortOrder: number,
  enforcement: ReleaseLifecycleGateEnforcement = "inherit"
): ReleaseLifecycleGateAttachment {
  return { gateType, enabled: true, enforcement, sortOrder };
}

function transition(
  fromKey: string,
  toKey: string | null,
  sortOrder: number,
  gates: ReleaseLifecycleGateAttachment[] = [],
  isPreviousStatus = false,
  enforcement: ReleaseLifecycleEnforcement = "flexible"
): ReleaseLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    isPreviousStatus,
    enabled: true,
    enforcement,
    isSystem: true,
    sortOrder,
    gates,
  };
}

/**
 * Reviewed default graph.
 * Flexible until Deploying/Deployed (CFG-06 Required). Extras kept:
 * Testing → Planning, Rolled Back → Cancelled.
 */
export const DEFAULT_RELEASE_LIFECYCLE_TRANSITIONS: readonly ReleaseLifecycleTransitionConfig[] = [
  transition("draft", "planning", 10, [
    gate("name_set", 10),
    gate("applications_linked", 20),
  ]),
  transition("draft", "cancelled", 20),
  transition("planning", "testing", 10, [
    gate("owner_set", 10),
    gate("size_set", 20),
    gate("name_set", 30),
    gate("applications_linked", 40),
    gate("dates_ordered", 50),
  ]),
  transition("planning", "blocked", 20),
  transition("planning", "cancelled", 30),
  transition("testing", "uat", 10, [
    gate("priority_set", 10),
    gate("test_signoff_complete", 20),
  ]),
  transition("testing", "blocked", 20),
  // Extra (product ask): Testing may return to Planning.
  transition("testing", "planning", 25),
  transition("testing", "cancelled", 30),
  transition("uat", "pending_cab", 10, [
    gate("uat_environment_booked", 10),
    gate("signoffs_complete", 20),
  ]),
  transition("uat", "testing", 20),
  transition("uat", "blocked", 30),
  transition("uat", "cancelled", 40),
  transition("pending_cab", "cab_approved", 10, [
    gate("go_live_date_set", 10),
    gate("no_open_blockers", 20),
  ]),
  transition("pending_cab", "deferred", 20),
  transition("pending_cab", "rejected", 30),
  transition("pending_cab", "blocked", 40),
  transition("pending_cab", "cancelled", 50),
  // Wave A (Release Fields Progression Blockers): Ready-target gates land on
  // cab_approved → ready_to_deploy (not one stage later on Ready → Deploying).
  transition("cab_approved", "ready_to_deploy", 10, [
    gate("scope_unchanged_since_cab", 10),
    gate("no_open_blockers", 20),
    gate("rollback_plan_documented", 30),
    gate("pre_deployment_checklist_complete", 40),
    gate("hard_dependencies_met", 50),
    gate("no_open_environment_conflicts", 60),
    // VR-26: warning-only for Large releases missing Dress Rehearsal.
    gate("dress_rehearsal_for_large", 70, "flexible"),
    // VR-27: High-score risks need a mitigation plan before Ready.
    gate("high_risks_mitigated", 75),
    gate("ops_signoff_complete", 80),
    gate("business_signoff_complete", 85),
  ]),
  transition("cab_approved", "pending_cab", 20),
  transition("cab_approved", "blocked", 30),
  transition("cab_approved", "cancelled", 40),
  // Deploying-target gates (VR-19 / VR-18 / AV-06 / AV-08 / VR-05).
  transition("ready_to_deploy", "deploying", 10, [
    gate("environment_booked_for_deploy", 10),
    gate("hard_dependencies_met", 20),
    gate("no_blocking_incidents", 30),
    gate("no_expired_env_bookings", 40),
    gate("outside_change_freeze", 50),
    gate("work_items_complete", 60),
  ]),
  transition("ready_to_deploy", "blocked", 20),
  transition("ready_to_deploy", "cancelled", 30),
  // CFG-06: Deploying / Deployed exits are Required (no override).
  // §4-08: outcome must be Verified (DeploymentState) before Deployed.
  transition(
    "deploying",
    "deployed",
    10,
    [gate("deployment_outcome_confirmed", 10)],
    false,
    "required"
  ),
  transition("deploying", "rolled_back", 20, [], false, "required"),
  transition("deploying", "blocked", 30, [], false, "required"),
  transition(
    "deployed",
    "closed",
    10,
    [
      gate("post_deployment_validation_complete", 10),
      gate("no_open_incidents", 20),
      gate("pir_complete", 30),
    ],
    false,
    "required"
  ),
  transition("deployed", "rolled_back", 20, [], false, "required"),
  transition("blocked", null, 10, [gate("blocker_resolved", 10)], true),
  transition("blocked", "cancelled", 20, [gate("blocker_resolved", 10)]),
  transition("rolled_back", "testing", 10, [gate("root_cause_documented", 10)]),
  // Extra (product ask): Rolled Back may cancel.
  transition("rolled_back", "cancelled", 20),
  transition("deferred", "pending_cab", 10, [gate("reactivation_decision_recorded", 10)]),
  transition("deferred", "cancelled", 20),
  transition("rejected", "planning", 10, [gate("rework_acknowledged", 10)]),
];

/** Fresh default object so consumers cannot mutate shared constants. */
export function createDefaultReleaseLifecycleConfig(): ReleaseLifecycleConfig {
  return {
    statuses: DEFAULT_RELEASE_LIFECYCLE_STATUSES.map((status) =>
      withReleaseStatusRoles({ ...status })
    ),
    transitions: DEFAULT_RELEASE_LIFECYCLE_TRANSITIONS.map((item) => ({
      ...item,
      gates: item.gates.map((itemGate) => ({
        ...itemGate,
        params: itemGate.params ? { ...itemGate.params } : undefined,
      })),
    })),
  };
}

/** Stable database uniqueness key for a transition target. */
export function releaseLifecycleTargetKey(
  transitionConfig: Pick<
    ReleaseLifecycleTransitionConfig,
    "toKey" | "isPreviousStatus"
  >
): string {
  return transitionConfig.isPreviousStatus
    ? PREVIOUS_STATUS_TARGET_KEY
    : transitionConfig.toKey ?? "";
}

/** Validate the complete graph before persistence or enforcement. */
export function validateReleaseLifecycleConfig(
  config: ReleaseLifecycleConfig
): string | null {
  if (
    config.statuses.length < 1 ||
    config.statuses.length > MAX_RELEASE_LIFECYCLE_STATUSES
  ) {
    return `Lifecycle must contain 1–${MAX_RELEASE_LIFECYCLE_STATUSES} statuses`;
  }
  if (config.transitions.length > MAX_RELEASE_LIFECYCLE_TRANSITIONS) {
    return `Lifecycle cannot exceed ${MAX_RELEASE_LIFECYCLE_TRANSITIONS} transitions`;
  }

  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const status of config.statuses) {
    const key = status.key.trim();
    const label = status.label.trim();
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) {
      return `Invalid status key: ${status.key}`;
    }
    if (!label || label.length > 80) return `Invalid label for status ${key}`;
    if (keys.has(key)) return `Duplicate status key: ${key}`;
    const normalizedLabel = label.toLocaleLowerCase();
    if (labels.has(normalizedLabel)) return `Duplicate status label: ${label}`;
    if (!RELEASE_LIFECYCLE_STATUS_KINDS.includes(status.kind)) {
      return `Invalid status kind for ${key}`;
    }
    if (status.terminal !== (status.kind === "terminal")) {
      return `Status ${key} terminal flag and kind must agree`;
    }
    if (!isReleaseEditMode(status.editMode)) {
      return `Invalid editMode for ${key}`;
    }
    keys.add(key);
    labels.add(normalizedLabel);
  }

  const statuses = new Map(config.statuses.map((status) => [status.key, status]));
  const edges = new Set<string>();
  for (const item of config.transitions) {
    const from = statuses.get(item.fromKey);
    if (!from) return `Unknown transition source: ${item.fromKey}`;
    if (item.isPreviousStatus !== (item.toKey === null)) {
      return `Transition ${item.fromKey} has an invalid previous-status target`;
    }
    // Previous-status returns are interrupt-only — keyed by config kind, not a
    // hardcoded status name like "blocked", so renamed interrupt statuses work.
    if (item.isPreviousStatus && from.kind !== "interrupt") {
      return `Only interrupt statuses may transition to previous status (got kind "${from.kind}" on ${item.fromKey})`;
    }
    const to = item.toKey ? statuses.get(item.toKey) : null;
    if (item.toKey && !to) return `Unknown transition target: ${item.toKey}`;
    if (!RELEASE_LIFECYCLE_ENFORCEMENTS.includes(item.enforcement)) {
      return `Invalid enforcement for ${item.fromKey}`;
    }
    if (item.enabled && from.terminal) {
      return `Cannot enable ${from.label} → ${to?.label ?? "previous"} because ${from.label} is a final status`;
    }
    if (item.enabled && !from.enabled) {
      return `Turn on the ${from.label} status (Statuses tab) before enabling this move`;
    }
    if (item.enabled && to && !to.enabled) {
      return `Turn on the ${to.label} status (Statuses tab) before enabling ${from.label} → ${to.label}`;
    }

    const edge = `${item.fromKey}:${releaseLifecycleTargetKey(item)}`;
    if (edges.has(edge)) return `Duplicate transition: ${edge}`;
    edges.add(edge);

    const gateTypes = new Set<string>();
    for (const attachment of item.gates) {
      if (!isReleaseLifecycleGateType(attachment.gateType)) {
        return `Unknown gate type: ${String(attachment.gateType)}`;
      }
      if (gateTypes.has(attachment.gateType)) {
        return `Duplicate gate ${attachment.gateType} on ${edge}`;
      }
      if (!RELEASE_LIFECYCLE_GATE_ENFORCEMENTS.includes(attachment.enforcement)) {
        return `Invalid gate enforcement for ${attachment.gateType}`;
      }
      const paramsError = validateReleaseLifecycleGateParams(
        attachment.gateType,
        attachment.params
      );
      if (paramsError) return paramsError;
      gateTypes.add(attachment.gateType);
    }
  }
  return null;
}

export type ReleaseLifecycleNormalizeResult = {
  config: ReleaseLifecycleConfig;
  /**
   * True only when a non-empty stored graph failed validation and was replaced
   * with the Enterprise Default. Missing/null input is a first-load case, not
   * a silent corruption fallback.
   */
  usedEnterpriseDefaultFallback: boolean;
  /** Validation error that triggered the fallback; null otherwise. */
  fallbackReason: string | null;
};

/**
 * Normalize stored configuration with an explicit fallback signal.
 *
 * Invalid stored graphs still fail open to shipped defaults for reads (writes
 * validate separately), but the fallback is never silent — callers must surface
 * `usedEnterpriseDefaultFallback`, and this function always logs when it fires.
 *
 * @param raw - Persisted graph, or null/undefined when none exists yet.
 * @param context - Optional ids for structured logs (never log the full graph).
 * @returns Normalized config plus whether Enterprise Default was substituted.
 */
export function normalizeReleaseLifecycleConfigResult(
  raw: unknown,
  context?: { clerkUserId?: string }
): ReleaseLifecycleNormalizeResult {
  if (raw == null) {
    return {
      config: createDefaultReleaseLifecycleConfig(),
      usedEnterpriseDefaultFallback: false,
      fallbackReason: null,
    };
  }
  // Prisma JSON snapshots arrive as unknown — narrow before cloning.
  if (
    typeof raw !== "object" ||
    !("statuses" in raw) ||
    !("transitions" in raw) ||
    !Array.isArray((raw as { statuses: unknown }).statuses) ||
    !Array.isArray((raw as { transitions: unknown }).transitions)
  ) {
    const reason = "Stored lifecycle config is not a valid statuses/transitions graph";
    console.error(
      "[release-lifecycle-config] INVALID_STORED_CONFIG — falling back to Enterprise Default",
      {
        reason,
        clerkUserId: context?.clerkUserId ?? null,
      }
    );
    return {
      config: createDefaultReleaseLifecycleConfig(),
      usedEnterpriseDefaultFallback: true,
      fallbackReason: reason,
    };
  }
  const graph = raw as ReleaseLifecycleConfig;
  const candidate: ReleaseLifecycleConfig = {
    statuses: graph.statuses.map((status) =>
      withReleaseStatusRoles({
        ...status,
        editMode: isReleaseEditMode(status.editMode)
          ? status.editMode
          : defaultReleaseEditModeForStatusKey(status.key),
      })
    ),
    transitions: graph.transitions.map((item) => ({
      ...item,
      gates: item.gates.map((itemGate) => ({
        ...itemGate,
        params: itemGate.params ? { ...itemGate.params } : undefined,
      })),
    })),
  };
  const validationError = validateReleaseLifecycleConfig(candidate);
  if (!validationError) {
    return {
      config: candidate,
      usedEnterpriseDefaultFallback: false,
      fallbackReason: null,
    };
  }

  // Loud on purpose: silent Enterprise Default substitution hides data corruption.
  console.error(
    "[release-lifecycle-config] INVALID_STORED_CONFIG — falling back to Enterprise Default",
    {
      reason: validationError,
      clerkUserId: context?.clerkUserId ?? null,
      statusCount: candidate.statuses.length,
      transitionCount: candidate.transitions.length,
    }
  );

  return {
    config: createDefaultReleaseLifecycleConfig(),
    usedEnterpriseDefaultFallback: true,
    fallbackReason: validationError,
  };
}

/**
 * Normalize stored configuration (config only). Prefer
 * `normalizeReleaseLifecycleConfigResult` when the fallback flag must be surfaced.
 *
 * @param raw - Persisted graph, or null/undefined when none exists yet.
 * @returns Normalized lifecycle config (may be Enterprise Default after fallback).
 */
export function normalizeReleaseLifecycleConfig(raw: unknown): ReleaseLifecycleConfig {
  return normalizeReleaseLifecycleConfigResult(raw).config;
}

export const DEFAULT_RELEASE_LIFECYCLE_CONFIG =
  createDefaultReleaseLifecycleConfig();
