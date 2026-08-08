/**
 * Per-user Alerts lifecycle configuration (statuses + transitions + types).
 * Mirrors the enterprise Alerts Lifecycle table; storage is Clerk-user scoped.
 */

export const ALERT_LIFECYCLE_ENFORCEMENTS = ["flexible", "required"] as const;
export type AlertLifecycleEnforcement =
  (typeof ALERT_LIFECYCLE_ENFORCEMENTS)[number];

export const ALERT_EDIT_MODES = [
  "full",
  "limited",
  "read_only",
  "immutable",
] as const;
export type AlertEditMode = (typeof ALERT_EDIT_MODES)[number];

export type AlertLifecycleStatusConfig = {
  key: string;
  label: string;
  sortOrder: number;
  terminal: boolean;
  enabled: boolean;
  isSystem: boolean;
  editMode: AlertEditMode;
  /** Cascade / notes shown in settings. */
  cascadeEffect: string;
};

export type AlertLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: AlertLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
};

export type AlertTypeConfig = {
  key: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  isSystem: boolean;
  description: string;
};

export type AlertLifecycleConfig = {
  statuses: AlertLifecycleStatusConfig[];
  transitions: AlertLifecycleTransitionConfig[];
  types: AlertTypeConfig[];
};

export const MAX_ALERT_LIFECYCLE_STATUSES = 20;
export const MAX_ALERT_LIFECYCLE_TRANSITIONS = 80;
export const MAX_ALERT_TYPES = 20;

export const DEFAULT_ALERT_LIFECYCLE_STATUSES: readonly AlertLifecycleStatusConfig[] =
  [
    {
      key: "pending",
      label: "Pending",
      sortOrder: 10,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Alert generated, not yet acknowledged",
    },
    {
      key: "acknowledged",
      label: "Acknowledged",
      sortOrder: 20,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "limited",
      cascadeEffect: "User confirmed receipt — stops repeat alerts",
    },
    {
      key: "actioned",
      label: "Actioned",
      sortOrder: 30,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — action taken; audit trail captured",
    },
    {
      key: "dismissed",
      label: "Dismissed",
      sortOrder: 40,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — no action needed; reason required",
    },
    {
      key: "expired",
      label: "Expired",
      sortOrder: 50,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — auto-expired (TTL exceeded)",
    },
  ];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  enforcement: AlertLifecycleEnforcement = "flexible"
): AlertLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    enabled: true,
    enforcement,
    isSystem: true,
    sortOrder,
  };
}

export const DEFAULT_ALERT_LIFECYCLE_TRANSITIONS: readonly AlertLifecycleTransitionConfig[] =
  [
    edge("pending", "acknowledged", 10),
    edge("pending", "dismissed", 20),
    edge("pending", "expired", 30),
    edge("acknowledged", "actioned", 10),
    edge("acknowledged", "dismissed", 20),
  ];

export const DEFAULT_ALERT_TYPES: readonly AlertTypeConfig[] = [
  {
    key: "reminder",
    label: "Reminder",
    sortOrder: 10,
    enabled: true,
    isSystem: true,
    description: "Scheduled or due-date reminder",
  },
  {
    key: "warning",
    label: "Warning",
    sortOrder: 20,
    enabled: true,
    isSystem: true,
    description: "Threshold or risk warning",
  },
  {
    key: "escalation",
    label: "Escalation",
    sortOrder: 30,
    enabled: true,
    isSystem: true,
    description: "Escalated attention required",
  },
  {
    key: "notification",
    label: "Notification",
    sortOrder: 40,
    enabled: true,
    isSystem: true,
    description: "Informational notification",
  },
];

/**
 * Fresh default alert lifecycle graph + types.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultAlertLifecycleConfig(): AlertLifecycleConfig {
  return {
    statuses: DEFAULT_ALERT_LIFECYCLE_STATUSES.map((s) => ({ ...s })),
    transitions: DEFAULT_ALERT_LIFECYCLE_TRANSITIONS.map((t) => ({ ...t })),
    types: DEFAULT_ALERT_TYPES.map((t) => ({ ...t })),
  };
}

/**
 * Validate alert lifecycle graph before persistence / enforcement.
 * @returns null when valid, otherwise a user-safe error string.
 */
export function validateAlertLifecycleConfig(
  config: AlertLifecycleConfig
): string | null {
  if (
    config.statuses.length < 1 ||
    config.statuses.length > MAX_ALERT_LIFECYCLE_STATUSES
  ) {
    return `Alert lifecycle must contain 1–${MAX_ALERT_LIFECYCLE_STATUSES} statuses`;
  }
  if (config.transitions.length > MAX_ALERT_LIFECYCLE_TRANSITIONS) {
    return `Alert lifecycle cannot exceed ${MAX_ALERT_LIFECYCLE_TRANSITIONS} transitions`;
  }
  if (!Array.isArray(config.types) || config.types.length > MAX_ALERT_TYPES) {
    return `Alert lifecycle cannot exceed ${MAX_ALERT_TYPES} types`;
  }
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const status of config.statuses) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(status.key)) {
      return `Invalid alert status key: ${status.key}`;
    }
    if (!status.label.trim()) return `Invalid label for ${status.key}`;
    if (keys.has(status.key)) return `Duplicate status key: ${status.key}`;
    const lower = status.label.trim().toLocaleLowerCase();
    if (labels.has(lower)) return `Duplicate status label: ${status.label}`;
    if (!ALERT_EDIT_MODES.includes(status.editMode)) {
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
    if (!ALERT_LIFECYCLE_ENFORCEMENTS.includes(item.enforcement)) {
      return `Invalid enforcement for ${item.fromKey} → ${item.toKey}`;
    }
    const edgeId = `${item.fromKey}:${item.toKey}`;
    if (edges.has(edgeId)) return `Duplicate transition: ${edgeId}`;
    edges.add(edgeId);
  }
  const typeKeys = new Set<string>();
  for (const type of config.types) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(type.key)) {
      return `Invalid alert type key: ${type.key}`;
    }
    if (!type.label.trim()) return `Invalid label for type ${type.key}`;
    if (typeKeys.has(type.key)) return `Duplicate type key: ${type.key}`;
    typeKeys.add(type.key);
  }
  return null;
}

/**
 * Normalize stored JSON; fall back to enterprise default when invalid.
 * @param raw - Persisted snapshot or null.
 */
export function normalizeAlertLifecycleConfig(raw: unknown): AlertLifecycleConfig {
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as AlertLifecycleConfig).statuses) &&
    Array.isArray((raw as AlertLifecycleConfig).transitions) &&
    Array.isArray((raw as AlertLifecycleConfig).types)
  ) {
    const candidate = raw as AlertLifecycleConfig;
    if (!validateAlertLifecycleConfig(candidate)) {
      return {
        statuses: candidate.statuses.map((s) => ({ ...s })),
        transitions: candidate.transitions.map((t) => ({ ...t })),
        types: candidate.types.map((t) => ({ ...t })),
      };
    }
  }
  return createDefaultAlertLifecycleConfig();
}

export const DEFAULT_ALERT_LIFECYCLE_CONFIG = createDefaultAlertLifecycleConfig();
