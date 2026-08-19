/**
 * Blocker field-lock catalog (sheet matrix + Cancelled/Reopened fill-in).
 *
 * Cancelled matches Closed (terminal, all locked including Status).
 * Reopened matches Assigned / In Progress (working state, same editable fields).
 * Status is info-only — lifecycle transitions own it, same as Release.
 */
import {
  fieldLockAlwaysLocked,
  fieldLockRules,
  type EntityFieldLockCatalogEntry,
} from "@/lib/entity-field-lock";
import { DEFAULT_BLOCKER_LIFECYCLE_STATUSES } from "@/lib/blocker-lifecycle-config";

/** Default graph keys — live Settings keys remap by key, then by label. */
export const BLOCKER_FIELD_LOCK_STATUS_KEYS = DEFAULT_BLOCKER_LIFECYCLE_STATUSES.map(
  (s) => s.key
);

export const BLOCKER_FIELD_LOCK_KEY_LABELS: Readonly<Record<string, string>> =
  Object.fromEntries(
    DEFAULT_BLOCKER_LIFECYCLE_STATUSES.map((s) => [s.key, s.label])
  );

/** Working (non-terminal) statuses — Reopened included with Assigned / In Progress. */
const BLOCKER_WORKING_KEYS = [
  "open",
  "assigned",
  "in_progress",
  "pending",
  "escalated",
  "reopened",
] as const;

function workingEditable(): EntityFieldLockCatalogEntry["defaultRules"] {
  return fieldLockRules(BLOCKER_FIELD_LOCK_STATUS_KEYS, BLOCKER_WORKING_KEYS);
}

function alwaysLocked(): EntityFieldLockCatalogEntry["defaultRules"] {
  return fieldLockAlwaysLocked(BLOCKER_FIELD_LOCK_STATUS_KEYS);
}

/** Status stays movable until Closed / Cancelled (lifecycle engine still owns PATCH status). */
function statusDisplayRules(): EntityFieldLockCatalogEntry["defaultRules"] {
  return fieldLockRules(BLOCKER_FIELD_LOCK_STATUS_KEYS, [
    ...BLOCKER_WORKING_KEYS,
    "resolved",
  ]);
}

export const BLOCKER_FIELD_LOCK_CATALOG: readonly EntityFieldLockCatalogEntry[] = [
  {
    fieldKey: "blockerCode",
    label: "Blocker ID",
    category: "Identity",
    lockRuleRef: "Auto",
    isConfigurable: false,
    defaultRules: alwaysLocked(),
  },
  {
    fieldKey: "releaseCode",
    label: "Release ID (link)",
    category: "Identity",
    lockRuleRef: "Open",
    isConfigurable: false,
    bodyKeys: ["releaseCode", "releaseId"],
    defaultRules: alwaysLocked(),
  },
  {
    fieldKey: "origin",
    label: "Origin",
    category: "Identity",
    lockRuleRef: "Auto",
    isConfigurable: false,
    unavailable: true,
    defaultRules: alwaysLocked(),
  },
  {
    fieldKey: "blockerType",
    label: "Category",
    category: "Classification",
    lockRuleRef: "Open",
    isConfigurable: true,
    defaultRules: workingEditable(),
  },
  {
    fieldKey: "blockerDescription",
    label: "Description",
    category: "Classification",
    lockRuleRef: "Open (§1-09, min 10 chars)",
    isConfigurable: true,
    defaultRules: workingEditable(),
  },
  {
    fieldKey: "severity",
    label: "Severity",
    category: "Classification",
    lockRuleRef: "Open",
    isConfigurable: true,
    defaultRules: workingEditable(),
  },
  {
    fieldKey: "impactOnRelease",
    label: "Impact (Blocking/Advisory)",
    category: "Classification",
    lockRuleRef: "Open (CFG-05)",
    isConfigurable: true,
    defaultRules: workingEditable(),
  },
  {
    fieldKey: "assignedTo",
    label: "Owner",
    category: "Ownership",
    lockRuleRef: "Assigned",
    isConfigurable: true,
    defaultRules: workingEditable(),
  },
  {
    fieldKey: "ownerId",
    label: "Owner ID",
    category: "Ownership",
    lockRuleRef: "Assigned",
    isConfigurable: false,
    unavailable: true,
    defaultRules: workingEditable(),
  },
  {
    fieldKey: "status",
    label: "Status",
    category: "Workflow",
    lockRuleRef: "Auto",
    isConfigurable: false,
    infoOnly: true,
    defaultRules: statusDisplayRules(),
  },
  {
    fieldKey: "createdAt",
    label: "Created Date",
    category: "Audit",
    lockRuleRef: "Auto",
    isConfigurable: false,
    bodyKeys: ["createdAt", "raisedDate"],
    defaultRules: alwaysLocked(),
  },
  {
    fieldKey: "resolutionNotes",
    label: "Notes",
    category: "Documentation",
    lockRuleRef: "Open",
    isConfigurable: true,
    bodyKeys: ["resolutionNotes", "notes"],
    defaultRules: workingEditable(),
  },
];

export const BLOCKER_FIELD_LOCK_GAP_ROWS: readonly EntityFieldLockCatalogEntry[] =
  BLOCKER_FIELD_LOCK_CATALOG.filter((e) => e.unavailable);
