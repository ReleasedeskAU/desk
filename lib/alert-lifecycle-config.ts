/**
 * Per-user Alerts lifecycle configuration (statuses + transitions + types).
 * Sheet graph plus live-only Dismissed / Expired. Storage is Clerk-user scoped.
 */

import {
  alertGate,
  isAlertLifecycleGateType,
  ALERT_LIFECYCLE_GATE_ENFORCEMENTS,
  type AlertLifecycleGateAttachment,
  type AlertLifecycleGateEnforcement,
} from "@/lib/alert-lifecycle-gates";

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
  /** New alert records land here. */
  isIntake: boolean;
  /** Acknowledging / working this status stops the same condition re-firing. */
  suppressesRepeatAlerts: boolean;
  /**
   * Auto-expire after N days in this status (null = none).
   * Mirrors Approval expiryDays; Active defaults to 7.
   */
  expiryDays: number | null;
};

export type AlertLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: AlertLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
  gates: AlertLifecycleGateAttachment[];
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

const REPEAT_SUPPRESS_KEYS = new Set([
  "acknowledged",
  "investigating",
  "escalated",
  "actioned",
]);

function alertStatus(
  partial: Omit<
    AlertLifecycleStatusConfig,
    "isIntake" | "suppressesRepeatAlerts" | "expiryDays"
  > & { expiryDays?: number | null }
): AlertLifecycleStatusConfig {
  return {
    ...partial,
    isIntake: partial.key === "pending",
    suppressesRepeatAlerts: REPEAT_SUPPRESS_KEYS.has(partial.key),
    expiryDays: partial.expiryDays ?? (partial.key === "pending" ? 7 : null),
  };
}

export const DEFAULT_ALERT_LIFECYCLE_STATUSES: readonly AlertLifecycleStatusConfig[] =
  [
    alertStatus({
      key: "pending",
      label: "Active",
      sortOrder: 10,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Alert generated, not yet acknowledged",
      expiryDays: 7,
    }),
    alertStatus({
      key: "acknowledged",
      label: "Acknowledged",
      sortOrder: 20,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "limited",
      cascadeEffect: "Recipient confirmed receipt — stops repeat alerts",
    }),
    alertStatus({
      key: "investigating",
      label: "Investigating",
      sortOrder: 30,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Being actively investigated",
    }),
    alertStatus({
      key: "escalated",
      label: "Escalated",
      sortOrder: 40,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Raised to a higher level",
    }),
    alertStatus({
      key: "actioned",
      label: "Resolved",
      sortOrder: 50,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "limited",
      cascadeEffect: "Worked and cleared — still editable until Closed",
    }),
    alertStatus({
      key: "closed",
      label: "Closed",
      sortOrder: 60,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — audit trail captured",
    }),
    alertStatus({
      key: "dismissed",
      label: "Dismissed",
      sortOrder: 70,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — never a real issue; justification required",
    }),
    alertStatus({
      key: "expired",
      label: "Expired",
      sortOrder: 80,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — auto-expired when the Active TTL is exceeded",
    }),
  ];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  enforcement: AlertLifecycleEnforcement = "flexible",
  gates: AlertLifecycleGateAttachment[] = []
): AlertLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    enabled: true,
    enforcement,
    isSystem: true,
    sortOrder,
    gates,
  };
}

const dismissGate = [alertGate("dismissal_justification_set", 10)];

export const DEFAULT_ALERT_LIFECYCLE_TRANSITIONS: readonly AlertLifecycleTransitionConfig[] =
  [
    edge("pending", "acknowledged", 10),
    edge("pending", "dismissed", 20, "flexible", dismissGate),
    edge("pending", "expired", 30, "required"),
    edge("acknowledged", "investigating", 10),
    edge("acknowledged", "actioned", 20),
    edge("acknowledged", "dismissed", 30, "flexible", dismissGate),
    edge("investigating", "actioned", 10),
    edge("investigating", "escalated", 20),
    edge("escalated", "investigating", 10),
    edge("escalated", "actioned", 20),
    edge("actioned", "closed", 10),
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
    transitions: DEFAULT_ALERT_LIFECYCLE_TRANSITIONS.map((t) => ({
      ...t,
      gates: t.gates.map((g) => ({ ...g })),
    })),
    types: DEFAULT_ALERT_TYPES.map((t) => ({ ...t })),
  };
}

function normalizeGates(raw: unknown): AlertLifecycleGateAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: AlertLifecycleGateAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<AlertLifecycleGateAttachment>;
    if (!isAlertLifecycleGateType(row.gateType)) continue;
    const enforcement = ALERT_LIFECYCLE_GATE_ENFORCEMENTS.includes(
      row.enforcement as AlertLifecycleGateEnforcement
    )
      ? (row.enforcement as AlertLifecycleGateEnforcement)
      : "inherit";
    out.push({
      gateType: row.gateType,
      enabled: row.enabled !== false,
      enforcement,
      sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : out.length * 10,
    });
  }
  return out;
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

function coerceStatus(raw: AlertLifecycleStatusConfig): AlertLifecycleStatusConfig {
  const defaults = DEFAULT_ALERT_LIFECYCLE_STATUSES.find((s) => s.key === raw.key);
  return {
    ...raw,
    isIntake: typeof raw.isIntake === "boolean" ? raw.isIntake : raw.key === "pending",
    suppressesRepeatAlerts:
      typeof raw.suppressesRepeatAlerts === "boolean"
        ? raw.suppressesRepeatAlerts
        : Boolean(defaults?.suppressesRepeatAlerts),
    expiryDays:
      typeof raw.expiryDays === "number" || raw.expiryDays === null
        ? raw.expiryDays
        : (defaults?.expiryDays ?? null),
  };
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
    const normalized: AlertLifecycleConfig = {
      statuses: candidate.statuses.map(coerceStatus),
      transitions: candidate.transitions.map((t) => ({
        ...t,
        gates: normalizeGates(t.gates),
      })),
      types: candidate.types.map((t) => ({ ...t })),
    };
    if (!validateAlertLifecycleConfig(normalized)) {
      return normalized;
    }
  }
  return createDefaultAlertLifecycleConfig();
}

export const DEFAULT_ALERT_LIFECYCLE_CONFIG = createDefaultAlertLifecycleConfig();
