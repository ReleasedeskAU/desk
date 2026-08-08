/**
 * Per-user Incidents lifecycle configuration (statuses + transitions).
 * Mirrors the enterprise Incidents Lifecycle table; storage is Clerk-user scoped.
 */

export const INCIDENT_LIFECYCLE_ENFORCEMENTS = ["flexible", "required"] as const;
export type IncidentLifecycleEnforcement =
  (typeof INCIDENT_LIFECYCLE_ENFORCEMENTS)[number];

export const INCIDENT_EDIT_MODES = ["full", "limited", "read_only", "immutable"] as const;
export type IncidentEditMode = (typeof INCIDENT_EDIT_MODES)[number];

export type IncidentLifecycleStatusConfig = {
  key: string;
  label: string;
  sortOrder: number;
  terminal: boolean;
  enabled: boolean;
  isSystem: boolean;
  editMode: IncidentEditMode;
  /** Cascade / notes shown in settings. */
  cascadeEffect: string;
};

export type IncidentLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: IncidentLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
};

export type IncidentLifecycleConfig = {
  statuses: IncidentLifecycleStatusConfig[];
  transitions: IncidentLifecycleTransitionConfig[];
};

export const MAX_INCIDENT_LIFECYCLE_STATUSES = 20;
export const MAX_INCIDENT_LIFECYCLE_TRANSITIONS = 80;

export const DEFAULT_INCIDENT_LIFECYCLE_STATUSES: readonly IncidentLifecycleStatusConfig[] =
  [
    {
      key: "open",
      label: "Open",
      sortOrder: 10,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Critical incidents auto-escalate if no owner (VR-13)",
    },
    {
      key: "investigating",
      label: "Investigating",
      sortOrder: 20,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Links to release if deployment-related",
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
    },
    {
      key: "resolving",
      label: "Resolving",
      sortOrder: 40,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "May block linked release (AV-06)",
    },
    {
      key: "resolved",
      label: "Resolved",
      sortOrder: 50,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "limited",
      cascadeEffect: "Critical incidents unblock release",
    },
    {
      key: "closed",
      label: "Closed",
      sortOrder: 60,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — verified complete",
    },
    {
      key: "reopened",
      label: "Reopened",
      sortOrder: 70,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "May re-trigger release blocks",
    },
  ];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  enforcement: IncidentLifecycleEnforcement = "flexible"
): IncidentLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    enabled: true,
    enforcement,
    isSystem: true,
    sortOrder,
  };
}

export const DEFAULT_INCIDENT_LIFECYCLE_TRANSITIONS: readonly IncidentLifecycleTransitionConfig[] =
  [
    edge("open", "investigating", 10),
    edge("open", "closed", 20),
    edge("investigating", "resolving", 10),
    edge("investigating", "escalated", 20),
    edge("investigating", "closed", 30),
    edge("escalated", "investigating", 10),
    edge("escalated", "resolving", 20),
    edge("escalated", "closed", 30),
    edge("resolving", "resolved", 10),
    edge("resolving", "escalated", 20),
    edge("resolved", "closed", 10),
    edge("resolved", "reopened", 20),
    edge("reopened", "investigating", 10),
  ];

/**
 * Fresh default incident lifecycle graph.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultIncidentLifecycleConfig(): IncidentLifecycleConfig {
  return {
    statuses: DEFAULT_INCIDENT_LIFECYCLE_STATUSES.map((s) => ({ ...s })),
    transitions: DEFAULT_INCIDENT_LIFECYCLE_TRANSITIONS.map((t) => ({ ...t })),
  };
}

/**
 * Validate incident lifecycle graph before persistence / enforcement.
 * @returns null when valid, otherwise a user-safe error string.
 */
export function validateIncidentLifecycleConfig(
  config: IncidentLifecycleConfig
): string | null {
  if (
    config.statuses.length < 1 ||
    config.statuses.length > MAX_INCIDENT_LIFECYCLE_STATUSES
  ) {
    return `Incident lifecycle must contain 1–${MAX_INCIDENT_LIFECYCLE_STATUSES} statuses`;
  }
  if (config.transitions.length > MAX_INCIDENT_LIFECYCLE_TRANSITIONS) {
    return `Incident lifecycle cannot exceed ${MAX_INCIDENT_LIFECYCLE_TRANSITIONS} transitions`;
  }
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const status of config.statuses) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(status.key)) {
      return `Invalid incident status key: ${status.key}`;
    }
    if (!status.label.trim()) return `Invalid label for ${status.key}`;
    if (keys.has(status.key)) return `Duplicate status key: ${status.key}`;
    const lower = status.label.trim().toLocaleLowerCase();
    if (labels.has(lower)) return `Duplicate status label: ${status.label}`;
    if (!INCIDENT_EDIT_MODES.includes(status.editMode)) {
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
    if (!INCIDENT_LIFECYCLE_ENFORCEMENTS.includes(item.enforcement)) {
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
export function normalizeIncidentLifecycleConfig(
  raw: unknown
): IncidentLifecycleConfig {
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as IncidentLifecycleConfig).statuses) &&
    Array.isArray((raw as IncidentLifecycleConfig).transitions)
  ) {
    const candidate = raw as IncidentLifecycleConfig;
    if (!validateIncidentLifecycleConfig(candidate)) {
      return {
        statuses: candidate.statuses.map((s) => ({ ...s })),
        transitions: candidate.transitions.map((t) => ({ ...t })),
      };
    }
  }
  return createDefaultIncidentLifecycleConfig();
}

export const DEFAULT_INCIDENT_LIFECYCLE_CONFIG =
  createDefaultIncidentLifecycleConfig();
