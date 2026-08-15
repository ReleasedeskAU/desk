/**
 * Per-user Dependencies lifecycle configuration (statuses + transitions).
 * Mirrors the enterprise Dependencies Lifecycle table; storage is Clerk-user scoped.
 */
import {
  DEPENDENCY_LIFECYCLE_GATE_ENFORCEMENTS,
  dependencyGate,
  isDependencyLifecycleGateType,
  type DependencyLifecycleGateAttachment,
} from "@/lib/dependency-lifecycle-gates";
import {
  DEPENDENCY_STATUS_ROLE_IDS,
  fillMissingRoleFields,
} from "@/lib/lifecycle-status-roles";

export const DEPENDENCY_LIFECYCLE_ENFORCEMENTS = ["flexible", "required"] as const;
export type DependencyLifecycleEnforcement =
  (typeof DEPENDENCY_LIFECYCLE_ENFORCEMENTS)[number];

export const DEPENDENCY_EDIT_MODES = [
  "full",
  "limited",
  "read_only",
  "immutable",
] as const;
export type DependencyEditMode = (typeof DEPENDENCY_EDIT_MODES)[number];

export type DependencyLifecycleStatusConfig = {
  key: string;
  label: string;
  sortOrder: number;
  terminal: boolean;
  enabled: boolean;
  isSystem: boolean;
  editMode: DependencyEditMode;
  /** Gate / cascade notes shown in settings. */
  cascadeEffect: string;
  /** When true, Hard deps in this status satisfy VR-18 (Deploying → Deployed). */
  satisfiesHardGate: boolean;
  /** New dependency records land here. */
  isIntake: boolean;
  /** AV-26 source: predecessor rollback reopens deps in this status. */
  reopensOnPredecessorRollback: boolean;
  /** AV-26 dest: exclusive landing status after a predecessor rollback. */
  rollbackWarningTarget: boolean;
};

export type DependencyLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: DependencyLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
  gates: DependencyLifecycleGateAttachment[];
};

export type DependencyLifecycleConfig = {
  statuses: DependencyLifecycleStatusConfig[];
  transitions: DependencyLifecycleTransitionConfig[];
};

export const MAX_DEPENDENCY_LIFECYCLE_STATUSES = 20;
export const MAX_DEPENDENCY_LIFECYCLE_TRANSITIONS = 80;

export const DEFAULT_DEPENDENCY_LIFECYCLE_STATUSES: readonly DependencyLifecycleStatusConfig[] =
  [
    {
      key: "identified",
      label: "Identified",
      sortOrder: 10,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Just discovered — confirm and start work from here",
      satisfiesHardGate: false,
      isIntake: true,
      reopensOnPredecessorRollback: false,
      rollbackWarningTarget: false,
    },
    {
      key: "pending",
      label: "Pending",
      sortOrder: 20,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect:
        "Awaiting the next working step (Confirmed / dual-ack is deferred)",
      satisfiesHardGate: false,
      isIntake: false,
      reopensOnPredecessorRollback: false,
      rollbackWarningTarget: false,
    },
    {
      key: "in_progress",
      label: "In Progress",
      sortOrder: 30,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Actively working the dependency",
      satisfiesHardGate: false,
      isIntake: false,
      reopensOnPredecessorRollback: false,
      rollbackWarningTarget: false,
    },
    {
      key: "at_risk",
      label: "At Risk",
      sortOrder: 40,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Warning indicator — timeline in jeopardy (AV-26 landing)",
      satisfiesHardGate: false,
      isIntake: false,
      reopensOnPredecessorRollback: false,
      rollbackWarningTarget: true,
    },
    {
      key: "blocked",
      label: "Blocked",
      sortOrder: 50,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Cannot proceed due to this dependency",
      satisfiesHardGate: false,
      isIntake: false,
      reopensOnPredecessorRollback: false,
      rollbackWarningTarget: false,
    },
    {
      key: "escalated",
      label: "Escalated",
      sortOrder: 60,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Requires management resolution",
      satisfiesHardGate: false,
      isIntake: false,
      reopensOnPredecessorRollback: false,
      rollbackWarningTarget: false,
    },
    {
      key: "met",
      label: "Met",
      sortOrder: 70,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "read_only",
      cascadeEffect:
        "FINAL — satisfied (AV-04 auto-update; AV-26 can reopen via system path)",
      satisfiesHardGate: true,
      isIntake: false,
      reopensOnPredecessorRollback: true,
      rollbackWarningTarget: false,
    },
    {
      key: "waived",
      label: "Waived",
      sortOrder: 80,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — requires documented approval",
      satisfiesHardGate: true,
      isIntake: false,
      reopensOnPredecessorRollback: false,
      rollbackWarningTarget: false,
    },
    {
      key: "removed",
      label: "Removed",
      sortOrder: 90,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — relationship deleted / no longer a dependency",
      satisfiesHardGate: true,
      isIntake: false,
      reopensOnPredecessorRollback: false,
      rollbackWarningTarget: false,
    },
  ];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  gates: DependencyLifecycleGateAttachment[] = [],
  enforcement: DependencyLifecycleEnforcement = "flexible"
): DependencyLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    enabled: true,
    enforcement,
    isSystem: true,
    sortOrder,
    gates: gates.map((gate) => ({ ...gate })),
  };
}

const documented = [dependencyGate("documented_approval", 10)];
const escalationNoted = [dependencyGate("escalation_noted", 10)];
const managementOut = [dependencyGate("management_resolution", 10)];
const managementDocumented = [
  dependencyGate("management_resolution", 10),
  dependencyGate("documented_approval", 20),
];

export const DEFAULT_DEPENDENCY_LIFECYCLE_TRANSITIONS: readonly DependencyLifecycleTransitionConfig[] =
  [
    // Identified (sheet: Pending, Confirmed — Confirmed deferred)
    edge("identified", "pending", 10),
    // AV-04 / early close: open intake must be able to reach a hard-gate status
    edge("identified", "met", 20),
    edge("identified", "waived", 30, documented),
    edge("identified", "removed", 40, documented),
    // Pending (sheet: Confirmed, Removed — Confirmed deferred → In Progress)
    edge("pending", "in_progress", 10),
    edge("pending", "at_risk", 20),
    edge("pending", "met", 30),
    edge("pending", "waived", 40, documented),
    edge("pending", "removed", 50, documented),
    // In Progress (sheet: At Risk, Blocked, Resolved)
    edge("in_progress", "at_risk", 10),
    edge("in_progress", "blocked", 20),
    edge("in_progress", "met", 30),
    edge("in_progress", "waived", 40, documented),
    // At Risk (sheet: In Progress, Blocked, Resolved)
    edge("at_risk", "in_progress", 10),
    edge("at_risk", "blocked", 20),
    edge("at_risk", "met", 30),
    edge("at_risk", "waived", 40, documented),
    edge("at_risk", "pending", 50),
    // Blocked (sheet: In Progress, Escalated)
    edge("blocked", "in_progress", 10),
    edge("blocked", "escalated", 20, escalationNoted),
    edge("blocked", "met", 30),
    // Escalated (sheet: Blocked, Resolved, Removed)
    edge("escalated", "blocked", 10),
    edge("escalated", "met", 20, managementOut),
    edge("escalated", "removed", 30, managementDocumented),
    edge("escalated", "waived", 40, managementDocumented),
  ];

/**
 * Fresh default dependency lifecycle graph.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultDependencyLifecycleConfig(): DependencyLifecycleConfig {
  return {
    statuses: DEFAULT_DEPENDENCY_LIFECYCLE_STATUSES.map((s) => ({ ...s })),
    transitions: DEFAULT_DEPENDENCY_LIFECYCLE_TRANSITIONS.map((t) => ({
      ...t,
      gates: t.gates.map((gate) => ({ ...gate })),
    })),
  };
}

function validateGates(
  item: DependencyLifecycleTransitionConfig,
  fromKey: string,
  toKey: string
): string | null {
  const seen = new Set<string>();
  for (const gate of item.gates ?? []) {
    if (!isDependencyLifecycleGateType(gate.gateType)) {
      return `Unknown check "${String(gate.gateType)}" on ${fromKey} → ${toKey}`;
    }
    if (seen.has(gate.gateType)) {
      return `Duplicate check ${gate.gateType} on ${fromKey} → ${toKey}`;
    }
    if (
      !DEPENDENCY_LIFECYCLE_GATE_ENFORCEMENTS.includes(
        gate.enforcement as (typeof DEPENDENCY_LIFECYCLE_GATE_ENFORCEMENTS)[number]
      )
    ) {
      return `Invalid check enforcement on ${fromKey} → ${toKey}`;
    }
    seen.add(gate.gateType);
  }
  return null;
}

/**
 * Validate dependency lifecycle graph before persistence / enforcement.
 * @returns null when valid, otherwise a user-safe error string.
 */
export function validateDependencyLifecycleConfig(
  config: DependencyLifecycleConfig
): string | null {
  if (
    config.statuses.length < 1 ||
    config.statuses.length > MAX_DEPENDENCY_LIFECYCLE_STATUSES
  ) {
    return `Dependency lifecycle must contain 1–${MAX_DEPENDENCY_LIFECYCLE_STATUSES} statuses`;
  }
  if (config.transitions.length > MAX_DEPENDENCY_LIFECYCLE_TRANSITIONS) {
    return `Dependency lifecycle cannot exceed ${MAX_DEPENDENCY_LIFECYCLE_TRANSITIONS} transitions`;
  }
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const status of config.statuses) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(status.key)) {
      return `Invalid dependency status key: ${status.key}`;
    }
    if (!status.label.trim()) return `Invalid label for ${status.key}`;
    if (keys.has(status.key)) return `Duplicate status key: ${status.key}`;
    const lower = status.label.trim().toLocaleLowerCase();
    if (labels.has(lower)) return `Duplicate status label: ${status.label}`;
    if (!DEPENDENCY_EDIT_MODES.includes(status.editMode)) {
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
    if (!DEPENDENCY_LIFECYCLE_ENFORCEMENTS.includes(item.enforcement)) {
      return `Invalid enforcement for ${item.fromKey} → ${item.toKey}`;
    }
    const edgeId = `${item.fromKey}:${item.toKey}`;
    if (edges.has(edgeId)) return `Duplicate transition: ${edgeId}`;
    edges.add(edgeId);
    const gateError = validateGates(item, item.fromKey, item.toKey);
    if (gateError) return gateError;
  }
  return null;
}

function coerceTransition(
  raw: DependencyLifecycleTransitionConfig
): DependencyLifecycleTransitionConfig {
  const gates = Array.isArray(raw.gates)
    ? raw.gates
        .filter((gate) => isDependencyLifecycleGateType(gate.gateType))
        .map((gate) => ({
          gateType: gate.gateType,
          enabled: Boolean(gate.enabled),
          enforcement: DEPENDENCY_LIFECYCLE_GATE_ENFORCEMENTS.includes(
            gate.enforcement as (typeof DEPENDENCY_LIFECYCLE_GATE_ENFORCEMENTS)[number]
          )
            ? gate.enforcement
            : "inherit",
          sortOrder: Number(gate.sortOrder) || 0,
        }))
    : [];
  return { ...raw, gates };
}

function coerceStatus(
  raw: DependencyLifecycleStatusConfig,
  fallback: DependencyLifecycleStatusConfig | undefined
): DependencyLifecycleStatusConfig {
  const filled = fillMissingRoleFields(
    { ...raw },
    fallback,
    DEPENDENCY_STATUS_ROLE_IDS
  );
  return {
    ...filled,
    satisfiesHardGate:
      typeof filled.satisfiesHardGate === "boolean"
        ? filled.satisfiesHardGate
        : false,
    isIntake: typeof filled.isIntake === "boolean" ? filled.isIntake : false,
    reopensOnPredecessorRollback:
      typeof filled.reopensOnPredecessorRollback === "boolean"
        ? filled.reopensOnPredecessorRollback
        : false,
    rollbackWarningTarget:
      typeof filled.rollbackWarningTarget === "boolean"
        ? filled.rollbackWarningTarget
        : false,
  };
}

/**
 * Normalize stored JSON; fall back to enterprise default when invalid.
 * @param raw - Persisted snapshot or null.
 */
export function normalizeDependencyLifecycleConfig(
  raw: unknown
): DependencyLifecycleConfig {
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as DependencyLifecycleConfig).statuses) &&
    Array.isArray((raw as DependencyLifecycleConfig).transitions)
  ) {
    const candidate = raw as DependencyLifecycleConfig;
    const defaults = createDefaultDependencyLifecycleConfig();
    const byKey = new Map(defaults.statuses.map((s) => [s.key, s]));
    const normalized: DependencyLifecycleConfig = {
      statuses: candidate.statuses.map((s) => coerceStatus(s, byKey.get(s.key))),
      transitions: candidate.transitions.map(coerceTransition),
    };
    if (!validateDependencyLifecycleConfig(normalized)) {
      return normalized;
    }
  }
  return createDefaultDependencyLifecycleConfig();
}

export const DEFAULT_DEPENDENCY_LIFECYCLE_CONFIG =
  createDefaultDependencyLifecycleConfig();
