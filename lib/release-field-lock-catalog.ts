/**
 * Field-lock matrix catalog for Release (RD-139 sheet alignment).
 * fieldKey values are Prisma fields or virtual keys (applications, environment).
 * Computed keys (previousStatus, blockerCount, conflictCount) are lock-matrix only.
 * Status keys are lifecycle keys — never tenant display labels.
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
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    // Sheet also lists Affected Systems separately; there is no second stored
    // column — skip that sheet row rather than invent a schema.
    fieldKey: "applications",
    label: "Application",
    category: "Identity",
    lockRuleRef: "§3-12",
    isConfigurable: true,
    bodyKeys: ["applicationIds", "applications"],
    defaultRules: rulesEditableUntil("testing"),
  },
  {
    fieldKey: "releaseOwnerId",
    label: "Release Owner",
    category: "Ownership",
    lockRuleRef: "§3-04",
    isConfigurable: true,
    bodyKeys: ["releaseOwnerId", "owner"],
    defaultRules: rulesEditableUntil("ready_to_deploy"),
  },
  {
    fieldKey: "releaseSize",
    label: "Size",
    category: "Scope",
    lockRuleRef: "VR-21",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab", {
      sideEffectAt: "cab_approved",
    }),
  },
  {
    fieldKey: "priority",
    label: "Priority",
    category: "Scope",
    lockRuleRef: "VR-21",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab", {
      sideEffectAt: "cab_approved",
    }),
  },
  {
    fieldKey: "scopeDescription",
    label: "Scope Description",
    category: "Scope",
    lockRuleRef: "VR-21",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab", {
      sideEffectAt: "cab_approved",
    }),
  },
  {
    fieldKey: "releaseType",
    label: "Release Type",
    category: "Scope",
    lockRuleRef: "§3-13",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("uat"),
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
    lockRuleRef: "§3-14",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("deploying"),
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
    defaultRules: rulesEditableUntil("ready_to_deploy"),
  },
  {
    fieldKey: "releaseDate",
    label: "End Date",
    category: "Schedule",
    lockRuleRef: "§3-10",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("ready_to_deploy"),
  },
  {
    fieldKey: "goLiveDate",
    label: "Go-Live Date",
    category: "Schedule",
    lockRuleRef: "§3-03",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "deployDate",
    label: "Deploy Date",
    category: "Schedule",
    lockRuleRef: "§3-03",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("deploying"),
  },
  {
    fieldKey: "cabDate",
    label: "CAB Date",
    category: "Schedule",
    lockRuleRef: "§3-11",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "devSignoff",
    label: "Tech Review",
    category: "Sign-Off",
    lockRuleRef: "§3-05",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "testSignoff",
    label: "QA Sign-Off — Test Phase",
    category: "Sign-Off",
    lockRuleRef: "§3-05",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "uatSignoff",
    label: "QA Sign-Off — UAT Phase",
    category: "Sign-Off",
    lockRuleRef: "§3-05",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "securityClearance",
    label: "Security Review",
    category: "Sign-Off",
    lockRuleRef: "§3-05",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "businessSignoff",
    label: "Business Review",
    category: "Sign-Off",
    lockRuleRef: "§3-05",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
  },
  {
    fieldKey: "opsSignoff",
    label: "Operations Review",
    category: "Sign-Off",
    lockRuleRef: "VR-31",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("ready_to_deploy"),
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
    lockRuleRef: "§3-06",
    isConfigurable: true,
    bodyKeys: ["testEnvRequired", "uatEnvRequired"],
    defaultRules: rulesEditableUntil("deploying"),
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
    lockRuleRef: "§3-18",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("deploying"),
  },
  {
    fieldKey: "dressRehearsal",
    label: "Dress Rehearsal",
    category: "Deployment",
    lockRuleRef: "§3-18",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("deploying"),
  },
  {
    fieldKey: "notes",
    label: "Release Notes",
    category: "Documentation",
    lockRuleRef: "§3-19",
    isConfigurable: true,
    defaultRules: rulesEditableUntil("pending_cab"),
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
    lockRuleRef: "§4",
    isConfigurable: false,
    infoOnly: true,
    // Display-only: the transition engine still owns writes. Closed/Cancelled
    // lock the picker in the UI; other stages stay gated by legal-next.
    defaultRules: rulesMostlyEditable(["closed", "cancelled"]),
  },
];

/**
 * Sheet rows with no stored Release counterpart. Do not invent columns.
 */
export const RELEASE_FIELD_LOCK_SKIPPED_SHEET_FIELDS = [
  {
    sheetLabel: "Affected Systems",
    reason:
      "No separate stored field; Application already maps to applicationIds",
  },
  {
    sheetLabel: "Duration Days",
    reason: "Computed from start/end dates on the detail page, not stored",
  },
] as const;

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

/** Minimal row shape for lock lookup (catalog defaults or persisted matrix). */
export type FieldLockRowLike = {
  fieldKey: string;
  statusRules: FieldLockStatusRules;
};

/**
 * Catalog defaults as lock rows for client fail-soft when the config API is
 * unavailable. No I/O.
 *
 * @returns One row per wired catalog field with default statusRules.
 */
export function catalogDefaultLockRows(): FieldLockRowLike[] {
  return RELEASE_FIELD_LOCK_CATALOG.filter((e) => !e.unavailable).map((entry) => ({
    fieldKey: entry.fieldKey,
    statusRules: entry.defaultRules,
  }));
}

/**
 * Resolve lock state for one matrix field. Missing status key fails closed.
 *
 * @param rows - Matrix rows.
 * @param fieldKey - Catalog fieldKey.
 * @param currentStatusKey - Lifecycle status key (not a display label).
 */
export function fieldLockStateAtStatus(
  rows: readonly FieldLockRowLike[],
  fieldKey: string,
  currentStatusKey: string
): FieldLockState {
  const row = rows.find((r) => r.fieldKey === fieldKey);
  if (!row) return "locked";
  return row.statusRules[currentStatusKey] ?? "locked";
}

/**
 * Match a stored/form status label or key to a live lifecycle key.
 * Unknown labels return null so callers fail closed instead of inventing a key.
 *
 * @param statuses - Live status key/label pairs.
 * @param status - Label or key from the release row / form.
 */
export function resolveFieldLockStatusKey(
  statuses: readonly { key: string; label: string }[],
  status: string
): string | null {
  const trimmed = status.trim();
  if (!trimmed) return null;
  const byKey = statuses.find((s) => s.key === trimmed);
  if (byKey) return byKey.key;
  const lower = trimmed.toLocaleLowerCase();
  const byLabel = statuses.find((s) => s.label.toLocaleLowerCase() === lower);
  if (byLabel) return byLabel.key;
  return null;
}

/**
 * Whether a form/API body key is locked at the current status.
 * Status writes stay on the lifecycle engine (never locked here).
 * Unknown status or missing row fails closed. Uncatalogued keys are not locked
 * by this matrix (edit policy may still deny them).
 *
 * @param rows - Matrix rows (live config or catalog defaults).
 * @param currentStatusKey - Resolved lifecycle key, or null when unknown.
 * @param bodyKey - Form / PATCH body key.
 */
export function isReleaseBodyKeyLocked(
  rows: readonly FieldLockRowLike[],
  currentStatusKey: string | null | undefined,
  bodyKey: string
): boolean {
  if (
    bodyKey === "status" ||
    bodyKey === "overrideReason" ||
    bodyKey === "previousStatus"
  ) {
    return false;
  }
  if (!currentStatusKey) return true;
  const entry = catalogEntryForBodyKey(bodyKey);
  if (!entry) return false;
  return fieldLockStateAtStatus(rows, entry.fieldKey, currentStatusKey) === "locked";
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
