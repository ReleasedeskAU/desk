/**
 * Per-user Approvals lifecycle configuration (decision statuses + transitions).
 * Mirrors the enterprise Approvals Lifecycle table; storage is Clerk-user scoped.
 */

import {
  APPROVAL_STATUS_ROLE_IDS,
  fillMissingRoleFields,
} from "@/lib/lifecycle-status-roles";

export const APPROVAL_LIFECYCLE_ENFORCEMENTS = ["flexible", "required"] as const;
export type ApprovalLifecycleEnforcement =
  (typeof APPROVAL_LIFECYCLE_ENFORCEMENTS)[number];

export const APPROVAL_EDIT_MODES = ["full", "limited", "read_only", "immutable"] as const;
export type ApprovalEditMode = (typeof APPROVAL_EDIT_MODES)[number];

export type ApprovalLifecycleStatusConfig = {
  key: string;
  label: string;
  sortOrder: number;
  terminal: boolean;
  enabled: boolean;
  isSystem: boolean;
  editMode: ApprovalEditMode;
  /** Short cascade / notes shown in settings. */
  cascadeEffect: string;
  /** AV-22: expiry after N days when not deployed (null = none). */
  expiryDays: number | null;
  /** New approval records land here. */
  isIntake: boolean;
  /** CASC-13 lands open approvals here when the parent release withdraws them. */
  isWithdrawn: boolean;
  /** Entering this decision requires a plain-text Conditions note. */
  requiresConditions: boolean;
  /** Entering this decision reverts the linked release to approvalRejectLanding. */
  revertsLinkedReleaseOnEnter: boolean;
};

export type ApprovalLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: ApprovalLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
};

export type ApprovalLifecycleConfig = {
  statuses: ApprovalLifecycleStatusConfig[];
  transitions: ApprovalLifecycleTransitionConfig[];
};

export const MAX_APPROVAL_LIFECYCLE_STATUSES = 20;
export const MAX_APPROVAL_LIFECYCLE_TRANSITIONS = 80;

const APPROVAL_ROLE_OMIT = [
  "isIntake",
  "isWithdrawn",
  "requiresConditions",
  "revertsLinkedReleaseOnEnter",
] as const;

export const DEFAULT_APPROVAL_LIFECYCLE_STATUSES: readonly Omit<
  ApprovalLifecycleStatusConfig,
  (typeof APPROVAL_ROLE_OMIT)[number]
>[] = [
  {
    key: "pending",
    label: "Pending",
    sortOrder: 10,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Standard state after CAB submission",
    expiryDays: null,
  },
  {
    key: "approved",
    label: "Approved",
    sortOrder: 20,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "30-day expiry if not deployed (AV-22)",
    expiryDays: 30,
  },
  {
    key: "approved_with_conditions",
    label: "Approved with Conditions",
    sortOrder: 25,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "Terminal yes, subject to recorded conditions",
    expiryDays: null,
  },
  {
    key: "rejected",
    label: "Rejected",
    sortOrder: 30,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "Reverts the linked release to its approval-reject landing status",
    expiryDays: null,
  },
  {
    key: "deferred",
    label: "Deferred",
    sortOrder: 40,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Release status = Deferred (informational); Flexible — not terminal",
    expiryDays: null,
  },
  {
    key: "expired",
    label: "Expired",
    sortOrder: 50,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "Triggered by AV-22 auto-expiry",
    expiryDays: null,
  },
  {
    key: "withdrawn",
    label: "Withdrawn",
    sortOrder: 60,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "Manual withdrawal by requestor",
    expiryDays: null,
  },
];

/**
 * Seed / fill-missing roles for a default approval status key.
 * Runtime must read flags on the live status object, not call this.
 */
export function defaultApprovalStatusRoles(key: string): Pick<
  ApprovalLifecycleStatusConfig,
  | "isIntake"
  | "isWithdrawn"
  | "requiresConditions"
  | "revertsLinkedReleaseOnEnter"
> {
  return {
    isIntake: key === "pending",
    isWithdrawn: key === "withdrawn",
    requiresConditions: key === "approved_with_conditions",
    revertsLinkedReleaseOnEnter: key === "rejected",
  };
}

function withApprovalStatusRoles(
  status: Omit<
    ApprovalLifecycleStatusConfig,
    | "isIntake"
    | "isWithdrawn"
    | "requiresConditions"
    | "revertsLinkedReleaseOnEnter"
  > &
    Partial<
      Pick<
        ApprovalLifecycleStatusConfig,
        | "isIntake"
        | "isWithdrawn"
        | "requiresConditions"
        | "revertsLinkedReleaseOnEnter"
      >
    >
): ApprovalLifecycleStatusConfig {
  const fallback = defaultApprovalStatusRoles(status.key);
  return fillMissingRoleFields(
    { ...fallback, ...status },
    { key: status.key, ...fallback },
    APPROVAL_STATUS_ROLE_IDS
  ) as ApprovalLifecycleStatusConfig;
}

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  enforcement: ApprovalLifecycleEnforcement = "flexible"
): ApprovalLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    enabled: true,
    enforcement,
    isSystem: true,
    sortOrder,
  };
}

/** Default graph: Pending → Approved / Approved with Conditions / Rejected / Deferred / Withdrawn. */
export const DEFAULT_APPROVAL_LIFECYCLE_TRANSITIONS: readonly ApprovalLifecycleTransitionConfig[] =
  [
    edge("pending", "approved", 10),
    edge("pending", "approved_with_conditions", 15),
    edge("pending", "rejected", 20),
    edge("pending", "deferred", 30),
    edge("pending", "withdrawn", 40),
    // Auto-expiry path (AV-22): unique Required exit from a status with expiryDays.
    edge("approved", "expired", 10, "required"),
  ];

/**
 * Fresh default approval lifecycle graph.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultApprovalLifecycleConfig(): ApprovalLifecycleConfig {
  return {
    statuses: DEFAULT_APPROVAL_LIFECYCLE_STATUSES.map((s) =>
      withApprovalStatusRoles({ ...s })
    ),
    transitions: DEFAULT_APPROVAL_LIFECYCLE_TRANSITIONS.map((t) => ({ ...t })),
  };
}

/**
 * True when this enabled Required edge is the unique expiry exit from a
 * terminal status that has expiryDays set (AV-22). Flag-driven — not key names.
 */
export function isApprovalTerminalExpiryExit(
  config: ApprovalLifecycleConfig,
  from: Pick<
    ApprovalLifecycleStatusConfig,
    "key" | "terminal" | "expiryDays"
  >,
  item: Pick<
    ApprovalLifecycleTransitionConfig,
    "enabled" | "fromKey" | "toKey" | "enforcement"
  >
): boolean {
  if (!item.enabled || !from.terminal) return false;
  if (item.enforcement !== "required") return false;
  if (from.expiryDays == null || from.expiryDays <= 0) return false;
  const outgoing = config.transitions.filter(
    (t) => t.enabled && t.fromKey === from.key
  );
  return outgoing.length === 1 && outgoing[0]!.toKey === item.toKey;
}

/**
 * Validate approval lifecycle graph before persistence / enforcement.
 * @returns null when valid, otherwise a user-safe error string.
 */
export function validateApprovalLifecycleConfig(
  config: ApprovalLifecycleConfig
): string | null {
  if (
    config.statuses.length < 1 ||
    config.statuses.length > MAX_APPROVAL_LIFECYCLE_STATUSES
  ) {
    return `Approval lifecycle must contain 1–${MAX_APPROVAL_LIFECYCLE_STATUSES} statuses`;
  }
  if (config.transitions.length > MAX_APPROVAL_LIFECYCLE_TRANSITIONS) {
    return `Approval lifecycle cannot exceed ${MAX_APPROVAL_LIFECYCLE_TRANSITIONS} transitions`;
  }
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const status of config.statuses) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(status.key)) {
      return `Invalid approval status key: ${status.key}`;
    }
    if (!status.label.trim()) return `Invalid label for ${status.key}`;
    if (keys.has(status.key)) return `Duplicate status key: ${status.key}`;
    const lower = status.label.trim().toLocaleLowerCase();
    if (labels.has(lower)) return `Duplicate status label: ${status.label}`;
    if (!APPROVAL_EDIT_MODES.includes(status.editMode)) {
      return `Invalid editMode for ${status.key}`;
    }
    keys.add(status.key);
    labels.add(lower);
  }
  const byKey = new Map(config.statuses.map((s) => [s.key, s]));
  const edges = new Set<string>();
  for (const item of config.transitions) {
    const from = byKey.get(item.fromKey);
    const to = byKey.get(item.toKey);
    if (!from) return `Unknown transition source: ${item.fromKey}`;
    if (!to) return `Unknown transition target: ${item.toKey}`;
    if (
      item.enabled &&
      from.terminal &&
      !isApprovalTerminalExpiryExit(config, from, item)
    ) {
      return `Enabled transition ${item.fromKey} → ${item.toKey} leaves a terminal status`;
    }
    if (item.enabled && (!from.enabled || !to.enabled)) {
      return `Enabled transition ${item.fromKey} → ${item.toKey} uses a disabled status`;
    }
    if (!APPROVAL_LIFECYCLE_ENFORCEMENTS.includes(item.enforcement)) {
      return `Invalid enforcement for ${item.fromKey} → ${item.toKey}`;
    }
    const edgeId = `${item.fromKey}:${item.toKey}`;
    if (edges.has(edgeId)) return `Duplicate transition: ${edgeId}`;
    edges.add(edgeId);
  }
  return null;
}

function injectMissingDefaultStatuses(
  stored: ApprovalLifecycleConfig
): ApprovalLifecycleConfig {
  const defaults = createDefaultApprovalLifecycleConfig();
  const have = new Set(stored.statuses.map((s) => s.key));
  const statuses = [
    ...stored.statuses.map((s) =>
      withApprovalStatusRoles({
        ...s,
        expiryDays:
          typeof s.expiryDays === "number" || s.expiryDays === null
            ? s.expiryDays
            : (defaults.statuses.find((d) => d.key === s.key)?.expiryDays ??
              null),
      })
    ),
    ...defaults.statuses.filter((s) => !have.has(s.key)),
  ];
  const edgeIds = new Set(
    stored.transitions.map((t) => `${t.fromKey}:${t.toKey}`)
  );
  const statusKeys = new Set(statuses.map((s) => s.key));
  const transitions = [
    ...stored.transitions.map((t) => ({ ...t })),
    ...defaults.transitions.filter((t) => {
      if (edgeIds.has(`${t.fromKey}:${t.toKey}`)) return false;
      return statusKeys.has(t.fromKey) && statusKeys.has(t.toKey);
    }),
  ];
  return { statuses, transitions };
}

/**
 * Normalize stored JSON; fall back to enterprise default when invalid.
 * Injects new system statuses/roles so older snapshots keep working.
 * @param raw - Persisted snapshot or null.
 */
export function normalizeApprovalLifecycleConfig(
  raw: unknown
): ApprovalLifecycleConfig {
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as ApprovalLifecycleConfig).statuses) &&
    Array.isArray((raw as ApprovalLifecycleConfig).transitions)
  ) {
    const candidate = injectMissingDefaultStatuses(
      raw as ApprovalLifecycleConfig
    );
    if (!validateApprovalLifecycleConfig(candidate)) {
      return candidate;
    }
  }
  return createDefaultApprovalLifecycleConfig();
}

export const DEFAULT_APPROVAL_LIFECYCLE_CONFIG =
  createDefaultApprovalLifecycleConfig();
