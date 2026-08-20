/**
 * Status-role contract: what a status *means* to automations, independent of
 * its display name or default key. Runtime code must read these flags from the
 * live (or pinned) config — never `key === "open"`.
 *
 * Settings copy lives in STATUS_ROLE_FIELDS (plain English). Internal ids are
 * for code and persistence only.
 */

export const STATUS_ROLE_UNIQUENESS = ["one", "many"] as const;
export type StatusRoleUniqueness = (typeof STATUS_ROLE_UNIQUENESS)[number];

export const STATUS_ROLE_VALUE_KINDS = ["boolean", "days"] as const;
export type StatusRoleValueKind = (typeof STATUS_ROLE_VALUE_KINDS)[number];

/**
 * Closed set of roles. Add here first, then to the entity field lists and
 * default graphs. Do not introduce a one-off `fromKey === "…"` check instead.
 */
export const STATUS_ROLE_IDS = [
  "isIntake",
  "blocksReleaseReady",
  "blocksLinkedRelease",
  "satisfiesHardGate",
  "escalateTarget",
  "unblocksParent",
  "withdrawApprovalsOnEnter",
  "readyMilestone",
  "deployingMilestone",
  "deployedMilestone",
  "staleAlertDays",
  "escalateAfterDays",
  "isWithdrawn",
  "writesCabScopeSnapshot",
  "clearsCabScopeSnapshot",
  "requiresConditions",
  "revertsLinkedReleaseOnEnter",
  "approvalRejectLanding",
  "autoResolvedOnDeploy",
  "rollbackReopensAtRisk",
  "atRiskWarning",
  "rollbackMilestone",
  "reopensOnPredecessorRollback",
  "rollbackWarningTarget",
  "suppressesRepeatAlerts",
] as const;
export type StatusRoleId = (typeof STATUS_ROLE_IDS)[number];

export type StatusRoleFieldDef = {
  id: StatusRoleId;
  /** Settings heading — never the raw flag name alone. */
  label: string;
  /** One-line explanation of what happens when this is on. */
  description: string;
  uniqueness: StatusRoleUniqueness;
  valueKind: StatusRoleValueKind;
};

/**
 * Catalog shown in Settings. Keep labels/descriptions in operator language.
 */
export const STATUS_ROLE_FIELDS: Record<StatusRoleId, StatusRoleFieldDef> = {
  isIntake: {
    id: "isIntake",
    label: "Starting status",
    description:
      "New records land here. Critical-incident owner checks also apply when leaving this status.",
    uniqueness: "one",
    valueKind: "boolean",
  },
  blocksReleaseReady: {
    id: "blocksReleaseReady",
    label: "Blocks the release from going Ready",
    description:
      "While a blocker is in this status, the linked release cannot move to Ready.",
    uniqueness: "many",
    valueKind: "boolean",
  },
  blocksLinkedRelease: {
    id: "blocksLinkedRelease",
    label: "Blocks the linked release from deploying",
    description:
      "While an incident is in this status, the linked release cannot start Deploying (AV-06).",
    uniqueness: "many",
    valueKind: "boolean",
  },
  satisfiesHardGate: {
    id: "satisfiesHardGate",
    label: "Counts as a met hard dependency",
    description:
      "Hard dependencies in this status are treated as clear for the Deploying check.",
    uniqueness: "many",
    valueKind: "boolean",
  },
  escalateTarget: {
    id: "escalateTarget",
    label: "Auto-escalate lands here",
    description:
      "Daily automation moves overdue records into this status (risks after N days; drift security alert).",
    uniqueness: "one",
    valueKind: "boolean",
  },
  unblocksParent: {
    id: "unblocksParent",
    label: "Unblocks the release when entered",
    description:
      "Entering this status can return a Blocked release to its previous stage if no other blocking blockers remain.",
    uniqueness: "one",
    valueKind: "boolean",
  },
  withdrawApprovalsOnEnter: {
    id: "withdrawApprovalsOnEnter",
    label: "Withdraw open approvals when entered",
    description:
      "Entering this status withdraws Pending and Deferred CAB approvals on the release.",
    uniqueness: "one",
    valueKind: "boolean",
  },
  readyMilestone: {
    id: "readyMilestone",
    label: "Ready-to-deploy milestone",
    description:
      "This stage and later on the main path freeze the dependency list (VR-36).",
    uniqueness: "one",
    valueKind: "boolean",
  },
  deployingMilestone: {
    id: "deployingMilestone",
    label: "Deploying milestone",
    description:
      "This stage and later lock environment bookings and stop new blockers (VR-35, booking lock).",
    uniqueness: "one",
    valueKind: "boolean",
  },
  deployedMilestone: {
    id: "deployedMilestone",
    label: "Deployed milestone",
    description:
      "Entering this status marks matching dependencies as Resolved (AV-04).",
    uniqueness: "one",
    valueKind: "boolean",
  },
  staleAlertDays: {
    id: "staleAlertDays",
    label: "Stale after (days)",
    description:
      "Raise a monitoring alert when a blocker sits in this status longer than this many days. Leave blank for no alert.",
    uniqueness: "many",
    valueKind: "days",
  },
  escalateAfterDays: {
    id: "escalateAfterDays",
    label: "Escalate after (days)",
    description:
      "Move this risk to the auto-escalate status after this many days. Leave blank to skip.",
    uniqueness: "many",
    valueKind: "days",
  },
  isWithdrawn: {
    id: "isWithdrawn",
    label: "Withdrawn when the parent release is cancelled",
    description:
      "Open approvals move here when the linked release enters a status that withdraws approvals.",
    uniqueness: "one",
    valueKind: "boolean",
  },
  writesCabScopeSnapshot: {
    id: "writesCabScopeSnapshot",
    label: "Write CAB scope snapshot when entered",
    description:
      "Entering this status stores Size, Priority, and Scope Description for the Ready-entry check.",
    uniqueness: "one",
    valueKind: "boolean",
  },
  clearsCabScopeSnapshot: {
    id: "clearsCabScopeSnapshot",
    label: "Clear CAB scope snapshot when entered",
    description:
      "Entering this status drops the stored CAB scope snapshot (usually a revert to Pending CAB).",
    uniqueness: "one",
    valueKind: "boolean",
  },
  requiresConditions: {
    id: "requiresConditions",
    label: "Requires conditions text when entered",
    description:
      "Moving into this decision requires a plain-text Conditions note (the terms the approval is subject to).",
    uniqueness: "many",
    valueKind: "boolean",
  },
  revertsLinkedReleaseOnEnter: {
    id: "revertsLinkedReleaseOnEnter",
    label: "Revert the linked release when entered",
    description:
      "Entering this decision moves the linked release to the status marked “Landing status after an approval rejection”.",
    uniqueness: "one",
    valueKind: "boolean",
  },
  approvalRejectLanding: {
    id: "approvalRejectLanding",
    label: "Landing status after an approval rejection",
    description:
      "When an approval decision is set to revert the linked release, the release moves here (Planning by default).",
    uniqueness: "one",
    valueKind: "boolean",
  },
  autoResolvedOnDeploy: {
    id: "autoResolvedOnDeploy",
    label: "Auto-update here when the upstream release deploys",
    description:
      "When the depended-on release reaches Deployed, open dependencies move to this status (AV-04). Counts as handled for hard-dependency checks.",
    uniqueness: "one",
    valueKind: "boolean",
  },
  rollbackReopensAtRisk: {
    id: "rollbackReopensAtRisk",
    label: "Upstream rollback moves this status to At Risk",
    description:
      "If the depended-on release rolls back, dependencies in this status are flagged At Risk (AV-26). System-only — users cannot make this move.",
    uniqueness: "one",
    valueKind: "boolean",
  },
  atRiskWarning: {
    id: "atRiskWarning",
    label: "At-risk warning status",
    description:
      "This is the warning status. AV-26 lands here when an upstream release rolls back.",
    uniqueness: "one",
    valueKind: "boolean",
  },
  rollbackMilestone: {
    id: "rollbackMilestone",
    label: "Rollback milestone",
    description:
      "Entering this status flags matching met dependencies as at risk (AV-26).",
    uniqueness: "one",
    valueKind: "boolean",
  },
  reopensOnPredecessorRollback: {
    id: "reopensOnPredecessorRollback",
    label: "Reopen when a predecessor rolls back",
    description:
      "Dependencies in this status are moved to the rollback-warning status when the upstream release rolls back (AV-26).",
    uniqueness: "many",
    valueKind: "boolean",
  },
  rollbackWarningTarget: {
    id: "rollbackWarningTarget",
    label: "Lands here after a predecessor rollback",
    description:
      "AV-26 moves reopened dependencies into this status (At Risk by default).",
    uniqueness: "one",
    valueKind: "boolean",
  },
  suppressesRepeatAlerts: {
    id: "suppressesRepeatAlerts",
    label: "Stops repeat alerts",
    description:
      "While an alert is in this status, the same application, metric, and environment will not raise another alert.",
    uniqueness: "many",
    valueKind: "boolean",
  },
};

/** Roles editable on Release statuses. */
export const RELEASE_STATUS_ROLE_IDS: readonly StatusRoleId[] = [
  "isIntake",
  "readyMilestone",
  "deployingMilestone",
  "deployedMilestone",
  "withdrawApprovalsOnEnter",
  "writesCabScopeSnapshot",
  "clearsCabScopeSnapshot",
  "approvalRejectLanding",
  "rollbackMilestone",
];

/** Roles editable on Blocker statuses. */
export const BLOCKER_STATUS_ROLE_IDS: readonly StatusRoleId[] = [
  "isIntake",
  "blocksReleaseReady",
  "unblocksParent",
  "staleAlertDays",
];

/** Roles editable on Incident statuses. */
export const INCIDENT_STATUS_ROLE_IDS: readonly StatusRoleId[] = [
  "isIntake",
  "blocksLinkedRelease",
  "unblocksParent",
];

/** Roles editable on Dependency statuses. */
export const DEPENDENCY_STATUS_ROLE_IDS: readonly StatusRoleId[] = [
  "isIntake",
  "satisfiesHardGate",
  "autoResolvedOnDeploy",
  "rollbackReopensAtRisk",
  "atRiskWarning",
  "reopensOnPredecessorRollback",
  "rollbackWarningTarget",
];

/** Roles editable on Risk statuses. */
export const RISK_STATUS_ROLE_IDS: readonly StatusRoleId[] = [
  "isIntake",
  "escalateTarget",
  "escalateAfterDays",
];

/** Roles editable on Drift statuses. */
export const DRIFT_STATUS_ROLE_IDS: readonly StatusRoleId[] = [
  "isIntake",
  "escalateTarget",
];

/** Roles editable on Approval statuses. */
export const APPROVAL_STATUS_ROLE_IDS: readonly StatusRoleId[] = [
  "isIntake",
  "isWithdrawn",
  "requiresConditions",
  "revertsLinkedReleaseOnEnter",
];

/** Roles editable on Conflict statuses. */
export const CONFLICT_STATUS_ROLE_IDS: readonly StatusRoleId[] = [
  "isIntake",
  "blocksReleaseReady",
];

/** Roles editable on Alert statuses. */
export const ALERT_STATUS_ROLE_IDS: readonly StatusRoleId[] = [
  "isIntake",
  "suppressesRepeatAlerts",
];

/** Roles editable on Conflict / Alert / Sign-off statuses. */
export const INTAKE_ONLY_ROLE_IDS: readonly StatusRoleId[] = ["isIntake"];

export type StatusRoleBag = Record<string, unknown> & {
  key: string;
  enabled?: boolean;
};

/**
 * Field defs for an entity’s Settings meaning editor.
 * @param ids - Role ids enabled for that entity.
 */
export function statusRoleFieldsFor(
  ids: readonly StatusRoleId[]
): StatusRoleFieldDef[] {
  return ids.map((id) => STATUS_ROLE_FIELDS[id]);
}

/** Role ids that must stay unique across the graph. */
export function exclusiveRoleIds(
  ids: readonly StatusRoleId[]
): StatusRoleId[] {
  return ids.filter((id) => STATUS_ROLE_FIELDS[id].uniqueness === "one");
}

/**
 * Coerce a stored boolean; missing values use the fallback (usually the default graph).
 */
export function coalesceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Coerce a stored day count; null means “off”.
 */
export function coalesceDays(
  value: unknown,
  fallback: number | null
): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return fallback;
}

/**
 * Enabled status labels matching a predicate (for Prisma `in` / `notIn` lists).
 * @param statuses - Live config statuses.
 * @param match - Role predicate.
 */
export function enabledStatusLabelsWhere<T extends { enabled: boolean; label: string }>(
  statuses: readonly T[],
  match: (status: T) => boolean
): string[] {
  return statuses.filter((s) => s.enabled && match(s)).map((s) => s.label);
}

/**
 * Label + key values for Prisma `status in (…)`. Rows may store either the
 * display label or the status key until Wave 4 persists `statusKey`.
 * @param statuses - Live config statuses.
 * @param match - Role predicate.
 */
export function enabledStatusMatchValues<
  T extends { enabled: boolean; label: string; key: string },
>(
  statuses: readonly T[],
  match: (status: T) => boolean
): string[] {
  const values = new Set<string>();
  for (const status of statuses) {
    if (!status.enabled || !match(status)) continue;
    const label = status.label.trim();
    const key = status.key.trim();
    if (label) values.add(label);
    if (key) values.add(key);
  }
  return [...values];
}

/**
 * The unique enabled status for a one-of role, or null if missing/ambiguous.
 */
export function uniqueEnabledStatusWhere<T extends { enabled?: boolean }>(
  statuses: readonly T[],
  match: (status: T) => boolean
): T | null {
  const hits = statuses.filter((s) => s.enabled && match(s));
  return hits.length === 1 ? hits[0]! : null;
}

/**
 * How many enabled statuses currently hold a one-of role (0 = missing, 2+ = clash).
 */
export function exclusiveRoleHitCount<T extends { enabled?: boolean }>(
  statuses: readonly T[],
  match: (status: T) => boolean
): number {
  return statuses.filter((s) => s.enabled && match(s)).length;
}

/**
 * Apply a role patch to one status. Exclusive booleans set true clear the same
 * flag on every other status so Settings stays internally consistent.
 * @returns New status array (does not mutate).
 */
export function applyStatusRolePatch<T extends StatusRoleBag>(
  statuses: readonly T[],
  statusKey: string,
  patch: Partial<T>,
  exclusiveIds: readonly StatusRoleId[]
): T[] {
  const exclusiveOn = exclusiveIds.filter((id) => patch[id] === true);
  return statuses.map((status) => {
    if (status.key === statusKey) return { ...status, ...patch };
    if (exclusiveOn.length === 0) return status;
    const cleared = { ...status };
    for (const id of exclusiveOn) {
      (cleared as StatusRoleBag)[id] = false;
    }
    return cleared;
  });
}

/**
 * Copy role fields from the default graph when a stored status is missing them.
 * Tenant-set values (including explicit false/null) are kept.
 */
export function fillMissingRoleFields<T extends StatusRoleBag>(
  stored: T,
  fallback: T | undefined,
  ids: readonly StatusRoleId[]
): T {
  if (!fallback) return stored;
  const next = { ...stored };
  for (const id of ids) {
    const current = stored[id];
    const def = fallback[id];
    if (STATUS_ROLE_FIELDS[id].valueKind === "days") {
      (next as StatusRoleBag)[id] = coalesceDays(current, (def as number | null) ?? null);
    } else if (current === undefined) {
      (next as StatusRoleBag)[id] = coalesceBoolean(def, false);
    }
  }
  return next;
}

/**
 * Loud missing-role payload for crons/cascades (Wave 2). Not used to skip silently.
 * @param roleId - Exclusive role that must exist exactly once.
 * @param count - Enabled statuses currently flagged.
 */
export type LifecycleRoleFaultCode =
  | "LIFECYCLE_ROLE_MISSING"
  | "LIFECYCLE_ROLE_AMBIGUOUS";

export type LifecycleRoleFault = {
  code: LifecycleRoleFaultCode;
  message: string;
  roleId: StatusRoleId;
  automation: string;
};

/**
 * Loud missing-role payload for crons/cascades. Not used to skip silently.
 * @param roleId - Exclusive role that must exist exactly once.
 * @param count - Enabled statuses currently flagged.
 */
export function missingExclusiveRoleError(
  roleId: StatusRoleId,
  count: number
): { code: LifecycleRoleFaultCode; message: string } {
  const field = STATUS_ROLE_FIELDS[roleId];
  if (count > 1) {
    return {
      code: "LIFECYCLE_ROLE_AMBIGUOUS",
      message: `More than one status is marked “${field.label}”. Keep exactly one.`,
    };
  }
  return {
    code: "LIFECYCLE_ROLE_MISSING",
    message: `No status is marked “${field.label}”. Set this under Lifecycle Settings so automation can run.`,
  };
}

/**
 * Exclusive-role problems on a graph (0 or 2+ hits). Settings shows these.
 * @param statuses - Live statuses.
 * @param roleIds - Roles that apply to this entity.
 */
export function exclusiveRoleIssues(
  statuses: readonly StatusRoleBag[],
  roleIds: readonly StatusRoleId[]
): Array<{ roleId: StatusRoleId; code: LifecycleRoleFaultCode; message: string }> {
  const issues: Array<{
    roleId: StatusRoleId;
    code: LifecycleRoleFaultCode;
    message: string;
  }> = [];
  for (const id of exclusiveRoleIds(roleIds)) {
    const count = exclusiveRoleHitCount(
      statuses.filter((s) => s.enabled !== false),
      (s) => s[id] === true
    );
    if (count !== 1) {
      const err = missingExclusiveRoleError(id, count);
      issues.push({ roleId: id, ...err });
    }
  }
  return issues;
}

/**
 * Roles that automation needs on at least one enabled status (dest, not exclusive).
 * AV-04 cannot mark dependencies Resolved if none count as a met hard dependency.
 */
export const AT_LEAST_ONE_STATUS_ROLE_IDS: readonly StatusRoleId[] = [
  "satisfiesHardGate",
];

/**
 * “At least one” dest-role gaps. Settings shows these next to exclusive clashes.
 * @param statuses - Live statuses.
 * @param roleIds - Roles that apply to this entity.
 */
export function atLeastOneRoleIssues(
  statuses: readonly StatusRoleBag[],
  roleIds: readonly StatusRoleId[]
): Array<{ roleId: StatusRoleId; code: LifecycleRoleFaultCode; message: string }> {
  const issues: Array<{
    roleId: StatusRoleId;
    code: LifecycleRoleFaultCode;
    message: string;
  }> = [];
  for (const id of roleIds) {
    if (!AT_LEAST_ONE_STATUS_ROLE_IDS.includes(id)) continue;
    const count = exclusiveRoleHitCount(
      statuses.filter((s) => s.enabled !== false),
      (s) => s[id] === true
    );
    if (count === 0) {
      const err = missingExclusiveRoleError(id, 0);
      issues.push({ roleId: id, ...err });
    }
  }
  return issues;
}

/**
 * All Settings-visible automation role problems (exclusive + at-least-one dest).
 * @param statuses - Live statuses.
 * @param roleIds - Roles that apply to this entity.
 */
export function automationRoleIssues(
  statuses: readonly StatusRoleBag[],
  roleIds: readonly StatusRoleId[]
): Array<{ roleId: StatusRoleId; code: LifecycleRoleFaultCode; message: string }> {
  return [
    ...exclusiveRoleIssues(statuses, roleIds),
    ...atLeastOneRoleIssues(statuses, roleIds),
  ];
}

/**
 * Resolve the unique enabled status for a one-of role, or a loud fault.
 * @param statuses - Live config statuses.
 * @param match - Role predicate.
 * @param roleId - Exclusive role being required.
 * @param automation - Check/cascade id for logs (AV-02, CASC-02, …).
 */
export function resolveExclusiveRole<T extends { enabled: boolean }>(
  statuses: readonly T[],
  match: (status: T) => boolean,
  roleId: StatusRoleId,
  automation: string
): { ok: true; status: T } | { ok: false; fault: LifecycleRoleFault } {
  const count = exclusiveRoleHitCount(statuses, match);
  if (count === 1) {
    return { ok: true, status: uniqueEnabledStatusWhere(statuses, match)! };
  }
  const err = missingExclusiveRoleError(roleId, count);
  return { ok: false, fault: { ...err, roleId, automation } };
}

/**
 * Log a role fault at error level so cron/host log drains surface it.
 * @param fault - Missing or ambiguous exclusive role.
 */
export function reportLifecycleRoleFault(fault: LifecycleRoleFault): void {
  console.error("[lifecycle-role] automation blocked", {
    code: fault.code,
    automation: fault.automation,
    roleId: fault.roleId,
    message: fault.message,
  });
}
