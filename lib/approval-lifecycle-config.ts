/**
 * Per-user Approvals lifecycle configuration (decision statuses + transitions).
 * Mirrors the enterprise Approvals Lifecycle table; storage is Clerk-user scoped.
 */

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

export const DEFAULT_APPROVAL_LIFECYCLE_STATUSES: readonly ApprovalLifecycleStatusConfig[] = [
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
    key: "rejected",
    label: "Rejected",
    sortOrder: 30,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "Release reverts to Planning (informational)",
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

/** Default graph: Pending → Approved/Rejected/Deferred. Deferred has no outgoing edges. */
export const DEFAULT_APPROVAL_LIFECYCLE_TRANSITIONS: readonly ApprovalLifecycleTransitionConfig[] =
  [
    edge("pending", "approved", 10),
    edge("pending", "rejected", 20),
    edge("pending", "deferred", 30),
    edge("pending", "withdrawn", 40),
    // Auto-expiry path (AV-22): Approved → Expired when job/timer fires.
    edge("approved", "expired", 10, "required"),
  ];

/**
 * Fresh default approval lifecycle graph.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultApprovalLifecycleConfig(): ApprovalLifecycleConfig {
  return {
    statuses: DEFAULT_APPROVAL_LIFECYCLE_STATUSES.map((s) => ({ ...s })),
    transitions: DEFAULT_APPROVAL_LIFECYCLE_TRANSITIONS.map((t) => ({ ...t })),
  };
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
    // Terminal sources cannot have enabled outgoing edges — except Approved → Expired (AV-22).
    if (
      item.enabled &&
      from.terminal &&
      !(item.fromKey === "approved" && item.toKey === "expired")
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

/**
 * Normalize stored JSON; fall back to enterprise default when invalid.
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
    const candidate = raw as ApprovalLifecycleConfig;
    if (!validateApprovalLifecycleConfig(candidate)) {
      return {
        statuses: candidate.statuses.map((s) => ({ ...s })),
        transitions: candidate.transitions.map((t) => ({ ...t })),
      };
    }
  }
  return createDefaultApprovalLifecycleConfig();
}

export const DEFAULT_APPROVAL_LIFECYCLE_CONFIG =
  createDefaultApprovalLifecycleConfig();
