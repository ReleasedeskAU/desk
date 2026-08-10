/**
 * Per-user Blocker lifecycle configuration (statuses + transitions + cascade metadata).
 * Mirrors the enterprise Blockers Lifecycle table; storage is Clerk-user scoped.
 */

export const BLOCKER_LIFECYCLE_ENFORCEMENTS = ["flexible", "required"] as const;
export type BlockerLifecycleEnforcement =
  (typeof BLOCKER_LIFECYCLE_ENFORCEMENTS)[number];

export const BLOCKER_EDIT_MODES = ["full", "limited", "read_only", "immutable"] as const;
export type BlockerEditMode = (typeof BLOCKER_EDIT_MODES)[number];

export type BlockerLifecycleStatusConfig = {
  key: string;
  label: string;
  sortOrder: number;
  terminal: boolean;
  enabled: boolean;
  isSystem: boolean;
  editMode: BlockerEditMode;
  /** Short cascade note shown in settings (informational + used by helpers). */
  cascadeEffect: string;
  /** When true, this status counts as an open blocker for release gates. */
  blocksReleaseReady: boolean;
  /** AV-03: stale alert after N days in this status (null = none). */
  staleAlertDays: number | null;
};

export type BlockerLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: BlockerLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
};

export type BlockerLifecycleConfig = {
  statuses: BlockerLifecycleStatusConfig[];
  transitions: BlockerLifecycleTransitionConfig[];
};

export const MAX_BLOCKER_LIFECYCLE_STATUSES = 20;
export const MAX_BLOCKER_LIFECYCLE_TRANSITIONS = 80;

export const DEFAULT_BLOCKER_LIFECYCLE_STATUSES: readonly BlockerLifecycleStatusConfig[] = [
  {
    key: "open",
    label: "Open",
    sortOrder: 10,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Blocks release transition to Ready",
    blocksReleaseReady: true,
    staleAlertDays: null,
  },
  {
    key: "in_progress",
    label: "In Progress",
    sortOrder: 20,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Stale alert after 5 days (AV-03)",
    blocksReleaseReady: true,
    staleAlertDays: 5,
  },
  {
    key: "escalated",
    label: "Escalated",
    sortOrder: 30,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Higher visibility",
    blocksReleaseReady: true,
    staleAlertDays: null,
  },
  {
    key: "resolved",
    label: "Resolved",
    sortOrder: 40,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "limited",
    cascadeEffect: "May auto-unblock release (CASC-02)",
    blocksReleaseReady: false,
    staleAlertDays: null,
  },
  {
    key: "closed",
    label: "Closed",
    sortOrder: 50,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "Release unblocked if all resolved/closed",
    blocksReleaseReady: false,
    staleAlertDays: null,
  },
  {
    key: "cancelled",
    label: "Cancelled",
    sortOrder: 60,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "No cascade",
    blocksReleaseReady: false,
    staleAlertDays: null,
  },
  {
    key: "reopened",
    label: "Reopened",
    sortOrder: 70,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "May re-block release",
    blocksReleaseReady: true,
    staleAlertDays: null,
  },
];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  enforcement: BlockerLifecycleEnforcement = "flexible"
): BlockerLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    enabled: true,
    enforcement,
    isSystem: true,
    sortOrder,
  };
}

export const DEFAULT_BLOCKER_LIFECYCLE_TRANSITIONS: readonly BlockerLifecycleTransitionConfig[] = [
  edge("open", "in_progress", 10),
  edge("open", "cancelled", 20),
  edge("in_progress", "resolved", 10),
  edge("in_progress", "escalated", 20),
  edge("in_progress", "cancelled", 30),
  edge("escalated", "in_progress", 10),
  edge("escalated", "resolved", 20),
  edge("escalated", "cancelled", 30),
  edge("resolved", "closed", 10),
  edge("resolved", "reopened", 20),
  edge("reopened", "in_progress", 10),
];

/**
 * Fresh default blocker lifecycle graph.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultBlockerLifecycleConfig(): BlockerLifecycleConfig {
  return {
    statuses: DEFAULT_BLOCKER_LIFECYCLE_STATUSES.map((s) => ({ ...s })),
    transitions: DEFAULT_BLOCKER_LIFECYCLE_TRANSITIONS.map((t) => ({ ...t })),
  };
}

/**
 * Validate blocker lifecycle graph before persistence / enforcement.
 * @returns null when valid, otherwise a user-safe error string.
 */
export function validateBlockerLifecycleConfig(
  config: BlockerLifecycleConfig
): string | null {
  if (
    config.statuses.length < 1 ||
    config.statuses.length > MAX_BLOCKER_LIFECYCLE_STATUSES
  ) {
    return `Blocker lifecycle must contain 1–${MAX_BLOCKER_LIFECYCLE_STATUSES} statuses`;
  }
  if (config.transitions.length > MAX_BLOCKER_LIFECYCLE_TRANSITIONS) {
    return `Blocker lifecycle cannot exceed ${MAX_BLOCKER_LIFECYCLE_TRANSITIONS} transitions`;
  }
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const status of config.statuses) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(status.key)) {
      return `Invalid blocker status key: ${status.key}`;
    }
    if (!status.label.trim()) return `Invalid label for ${status.key}`;
    if (keys.has(status.key)) return `Duplicate status key: ${status.key}`;
    const lower = status.label.trim().toLocaleLowerCase();
    if (labels.has(lower)) return `Duplicate status label: ${status.label}`;
    if (!BLOCKER_EDIT_MODES.includes(status.editMode)) {
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
    if (item.enabled && (from.terminal || !from.enabled || !to.enabled)) {
      return `Enabled transition ${item.fromKey} → ${item.toKey} uses a terminal or disabled status`;
    }
    if (!BLOCKER_LIFECYCLE_ENFORCEMENTS.includes(item.enforcement)) {
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
export function normalizeBlockerLifecycleConfig(
  raw: unknown
): BlockerLifecycleConfig {
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as BlockerLifecycleConfig).statuses) &&
    Array.isArray((raw as BlockerLifecycleConfig).transitions)
  ) {
    const candidate = raw as BlockerLifecycleConfig;
    if (!validateBlockerLifecycleConfig(candidate)) {
      return {
        statuses: candidate.statuses.map((s) => ({ ...s })),
        transitions: candidate.transitions.map((t) => ({ ...t })),
      };
    }
  }
  return createDefaultBlockerLifecycleConfig();
}

export const DEFAULT_BLOCKER_LIFECYCLE_CONFIG =
  createDefaultBlockerLifecycleConfig();
