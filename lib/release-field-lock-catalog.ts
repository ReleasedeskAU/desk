/**
 * Field-lock matrix catalog for Release (Phase 1 + Tranche 3 gap closure).
 * fieldKey values are Prisma fields or virtual keys (applications, environment).
 * Computed keys (previousStatus, blockerCount, conflictCount) are lock-matrix only.
 */

export const FIELD_LOCK_STATES = [
  "editable",
  "locked",
  "editable_with_side_effect",
] as const;

export type FieldLockState = (typeof FIELD_LOCK_STATES)[number];

export type FieldLockCategory =
  | "Identity"
  | "Ownership"
  | "Scope"
  | "Schedule"
  | "Sign-Off"
  | "Deployment"
  | "Documentation"
  | "Computed"
  | "Audit"
  | "Workflow"
  | "Unavailable";

/** Excel / UI label → statusRules keyed by default lifecycle status keys. */
export type FieldLockStatusRules = Record<string, FieldLockState>;

export type ReleaseFieldLockCatalogEntry = {
  fieldKey: string;
  label: string;
  category: FieldLockCategory;
  lockRuleRef: string | null;
  isConfigurable: boolean;
  /**
   * When set, PATCH body keys in this list are checked under this matrix row.
   * Default: [fieldKey] only.
   */
  bodyKeys?: readonly string[];
  /** Info-only row (e.g. status) — never enforced by field-lock engine. */
  infoOnly?: boolean;
  /** Not wired to a Release column yet — matrix shows disabled row. */
  unavailable?: boolean;
  /** Default rules keyed by DEFAULT_RELEASE_LIFECYCLE_STATUSES keys. */
  defaultRules: FieldLockStatusRules;
};

const MAIN = [
  "draft",
  "planning",
  "testing",
  "uat",
  "pending_cab",
  "cab_approved",
  "ready_to_deploy",
  "deploying",
  "deployed",
  "closed",
  "cancelled",
  "blocked",
  "rolled_back",
  "deferred",
  "rejected",
] as const;

/**
 * Build statusRules: editable for early statuses, locked from `lockFrom` onward
 * (and for terminal/interrupt statuses listed).
 */
function rulesEditableUntil(
  lockFrom: (typeof MAIN)[number],
  opts?: { sideEffectAt?: (typeof MAIN)[number] }
): FieldLockStatusRules {
  const lockIdx = MAIN.indexOf(lockFrom);
  const out: FieldLockStatusRules = {};
  for (let i = 0; i < MAIN.length; i++) {
    const key = MAIN[i]!;
    if (opts?.sideEffectAt === key) {
      out[key] = "editable_with_side_effect";
    } else if (i < lockIdx) {
      out[key] = "editable";
    } else {
      out[key] = "locked";
    }
  }
  // Rejected is a rework branch: fields that locked on the mainline reopen so
  // the release can be corrected (sheet: “Yes — gates unlocked”). Always-locked
  // identity fields use rulesAlwaysLocked() and stay locked.
  out.rejected = "editable";
  return out;
}

function rulesAlwaysLocked(): FieldLockStatusRules {
  const out: FieldLockStatusRules = {};
  for (const key of MAIN) out[key] = "locked";
  return out;
}

function rulesMostlyEditable(locked: readonly string[]): FieldLockStatusRules {
  const lockedSet = new Set(locked);
  const out: FieldLockStatusRules = {};
  for (const key of MAIN) {
    out[key] = lockedSet.has(key) ? "locked" : "editable";
  }
  return out;
}

/** Phase 1 seedable + info rows (wired fields). */
export const RELEASE_FIELD_LOCK_CATALOG: readonly ReleaseFieldLockCatalogEntry[] = [
  {
    fieldKey: "releaseCode",
    label: "Release ID",
    category: "Identity",
    lockRuleRef: "§3-01",
    isConfigurable: false,
    defaultRules: rulesAlwaysLocked(),
  },
  {
    fieldKey: "name",
    label: "Release Name",
    category: "Identity",
    lockRuleRef: "§3-02",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("deploying"),
  },
  {
    fieldKey: "applications",
    label: "Application / Affected Systems",
    category: "Identity",
    lockRuleRef: "§3-03",
    isConfigurable: true,
    bodyKeys: ["applicationIds", "applications"],
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "releaseOwnerId",
    label: "Release Owner",
    category: "Ownership",
    lockRuleRef: "§3-04",
    isConfigurable: true,
    bodyKeys: ["releaseOwnerId", "owner"],
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "releaseSize",
    label: "Size",
    category: "Scope",
    lockRuleRef: "VR-21",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("ready_to_deploy", {
      sideEffectAt: "cab_approved",
    }),
  },
  {
    fieldKey: "priority",
    label: "Priority",
    category: "Scope",
    lockRuleRef: "VR-21",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("ready_to_deploy", {
      sideEffectAt: "cab_approved",
    }),
  },
  {
    fieldKey: "scopeDescription",
    label: "Scope Description",
    category: "Scope",
    lockRuleRef: "VR-21",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("ready_to_deploy", {
      sideEffectAt: "cab_approved",
    }),
  },
  {
    fieldKey: "releaseType",
    label: "Release Type",
    category: "Scope",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "changeDescription",
    label: "Change Description",
    category: "Documentation",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "justification",
    label: "Justification",
    category: "Documentation",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "impact",
    label: "Impact Assessment",
    category: "Scope",
    lockRuleRef: "§3-08",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "backupOwner",
    label: "Backup Owner",
    category: "Ownership",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "technicalLead",
    label: "Technical Lead",
    category: "Ownership",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "businessOwner",
    label: "Business Owner",
    category: "Ownership",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "startDate",
    label: "Start Date",
    category: "Schedule",
    lockRuleRef: "§3-09",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("deploying"),
  },
  {
    fieldKey: "releaseDate",
    label: "End Date",
    category: "Schedule",
    lockRuleRef: "§3-10",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("deploying"),
  },
  {
    fieldKey: "goLiveDate",
    label: "Go-Live Date",
    category: "Schedule",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesEditableUntil("deploying"),
  },
  {
    fieldKey: "deployDate",
    label: "Deploy Date",
    category: "Schedule",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesEditableUntil("deployed"),
  },
  {
    fieldKey: "cabDate",
    label: "CAB Date",
    category: "Schedule",
    lockRuleRef: "§3-11",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("cab_approved"),
  },
  {
    fieldKey: "devSignoff",
    label: "Dev Sign-Off",
    category: "Sign-Off",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesMostlyEditable(["closed", "cancelled", "deployed"]),
  },
  {
    fieldKey: "testSignoff",
    label: "Test Sign-Off",
    category: "Sign-Off",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesMostlyEditable(["closed", "cancelled", "deployed"]),
  },
  {
    fieldKey: "uatSignoff",
    label: "UAT Sign-Off",
    category: "Sign-Off",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesMostlyEditable(["closed", "cancelled", "deployed"]),
  },
  {
    fieldKey: "securityClearance",
    label: "Security Sign-Off",
    category: "Sign-Off",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesMostlyEditable(["closed", "cancelled", "deployed"]),
  },
  {
    fieldKey: "businessSignoff",
    label: "Business Sign-Off",
    category: "Sign-Off",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesMostlyEditable(["closed", "cancelled", "deployed"]),
  },
  {
    fieldKey: "opsSignoff",
    label: "Ops Sign-Off",
    category: "Sign-Off",
    lockRuleRef: "VR-31",
    isConfigurable: true,
    defaultRules: rulesMostlyEditable(["closed", "cancelled", "deployed"]),
  },
  {
    fieldKey: "postImplementationReviewCompleted",
    label: "Post-Implementation Review Completed",
    category: "Sign-Off",
    lockRuleRef: "VR-34",
    isConfigurable: true,
    defaultRules: rulesMostlyEditable(["closed", "cancelled"]),
  },
  {
    fieldKey: "environment",
    label: "Environment",
    category: "Deployment",
    lockRuleRef: null,
    isConfigurable: true,
    bodyKeys: ["testEnvRequired", "uatEnvRequired"],
    defaultRules: rulesEditableUntil("ready_to_deploy"),
  },
  {
    fieldKey: "deploymentWindow",
    label: "Deployment Window",
    category: "Deployment",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesEditableUntil("deploying"),
  },
  {
    fieldKey: "rollbackPlan",
    label: "Rollback Plan",
    category: "Deployment",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesEditableUntil("deploying"),
  },
  {
    fieldKey: "approvalStatus",
    label: "Approval Status",
    category: "Sign-Off",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesMostlyEditable(["closed", "cancelled"]),
  },
  {
    fieldKey: "hypercarePlan",
    label: "Hypercare Plan",
    category: "Documentation",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesEditableUntil("deploying"),
  },
  {
    fieldKey: "trainingStatus",
    label: "Training Status",
    category: "Documentation",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesEditableUntil("deploying"),
  },
  {
    fieldKey: "stakeholders",
    label: "Stakeholders",
    category: "Ownership",
    lockRuleRef: null,
    isConfigurable: true,
    bodyKeys: ["stakeholderIds", "stakeholders"],
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "goLiveChecklistPercent",
    label: "Deployment Checklist",
    category: "Deployment",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesMostlyEditable(["closed", "cancelled"]),
  },
  {
    fieldKey: "dressRehearsal",
    label: "Dress Rehearsal",
    category: "Deployment",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesMostlyEditable(["closed", "cancelled", "deployed"]),
  },
  {
    fieldKey: "notes",
    label: "Release Notes",
    category: "Documentation",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesMostlyEditable(["closed", "cancelled"]),
  },
  {
    fieldKey: "commsPlan",
    label: "Communication Plan",
    category: "Documentation",
    lockRuleRef: null,
    isConfigurable: true,
    defaultRules: rulesEditableUntil("deploying"),
  },
  {
    fieldKey: "releaseHealth",
    label: "Release Health",
    category: "Computed",
    lockRuleRef: null,
    isConfigurable: false,
    defaultRules: rulesAlwaysLocked(),
  },
  {
    fieldKey: "readinessPercent",
    label: "Readiness %",
    category: "Computed",
    lockRuleRef: null,
    isConfigurable: false,
    defaultRules: rulesAlwaysLocked(),
  },
  {
    fieldKey: "weightedRiskScore",
    label: "Risk Score",
    category: "Computed",
    lockRuleRef: null,
    isConfigurable: false,
    bodyKeys: ["weightedRiskScore", "weightedRiskLevel"],
    defaultRules: rulesAlwaysLocked(),
  },
  {
    fieldKey: "createdAt",
    label: "Created Date",
    category: "Audit",
    lockRuleRef: null,
    isConfigurable: false,
    defaultRules: rulesAlwaysLocked(),
  },
  {
    fieldKey: "updatedAt",
    label: "Last Modified Date",
    category: "Audit",
    lockRuleRef: null,
    isConfigurable: false,
    defaultRules: rulesAlwaysLocked(),
  },
  {
    fieldKey: "createdBy",
    label: "Created By",
    category: "Audit",
    lockRuleRef: null,
    isConfigurable: false,
    defaultRules: rulesAlwaysLocked(),
  },
  {
    fieldKey: "lastModifiedBy",
    label: "Last Modified By",
    category: "Audit",
    lockRuleRef: null,
    isConfigurable: false,
    defaultRules: rulesAlwaysLocked(),
  },
  {
    fieldKey: "previousStatus",
    label: "Previous Status",
    category: "Computed",
    lockRuleRef: null,
    isConfigurable: false,
    defaultRules: rulesAlwaysLocked(),
  },
  {
    fieldKey: "blockerCount",
    label: "Blocker Count",
    category: "Computed",
    lockRuleRef: null,
    isConfigurable: false,
    defaultRules: rulesAlwaysLocked(),
  },
  {
    fieldKey: "conflictCount",
    label: "Conflict Count",
    category: "Computed",
    lockRuleRef: null,
    isConfigurable: false,
    defaultRules: rulesAlwaysLocked(),
  },
  {
    fieldKey: "status",
    label: "Status",
    category: "Workflow",
    lockRuleRef: null,
    isConfigurable: false,
    infoOnly: true,
    defaultRules: rulesAlwaysLocked(),
  },
];

/** No remaining unavailable gap rows — Tranche 3 wired all prior gaps. */
export const RELEASE_FIELD_LOCK_GAP_ROWS: readonly Omit<
  ReleaseFieldLockCatalogEntry,
  "defaultRules"
>[] = [];

/**
 * Resolve which catalog entry owns a PATCH body key.
 * @param bodyKey - Top-level request field.
 */
export function catalogEntryForBodyKey(
  bodyKey: string
): ReleaseFieldLockCatalogEntry | null {
  for (const entry of RELEASE_FIELD_LOCK_CATALOG) {
    if (entry.infoOnly || entry.unavailable) continue;
    const keys = entry.bodyKeys ?? [entry.fieldKey];
    if (keys.includes(bodyKey)) return entry;
  }
  return null;
}

/**
 * Whether a lock state string is valid.
 */
export function isFieldLockState(value: unknown): value is FieldLockState {
  return (
    typeof value === "string" &&
    (FIELD_LOCK_STATES as readonly string[]).includes(value)
  );
}
