/**
 * Per-user Dependencies lifecycle configuration (statuses + transitions).
 * Mirrors the enterprise Dependencies Lifecycle table; storage is Clerk-user scoped.
 */

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
};

export type DependencyLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: DependencyLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
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
      key: "pending",
      label: "Pending",
      sortOrder: 10,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Hard dependencies block Deploying",
      satisfiesHardGate: false,
    },
    {
      key: "at_risk",
      label: "At Risk",
      sortOrder: 20,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Warning indicator — timeline in jeopardy",
      satisfiesHardGate: false,
    },
    {
      key: "met",
      label: "Met",
      sortOrder: 30,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "read_only",
      cascadeEffect:
        "FINAL — satisfied (AV-04 auto-update; AV-26: no silent revert if predecessor rolls back)",
      satisfiesHardGate: true,
    },
    {
      key: "waived",
      label: "Waived",
      sortOrder: 40,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — requires documented approval",
      satisfiesHardGate: true,
    },
    {
      key: "removed",
      label: "Removed",
      sortOrder: 50,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — relationship deleted / no longer a dependency",
      satisfiesHardGate: true,
    },
  ];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  enforcement: DependencyLifecycleEnforcement = "flexible"
): DependencyLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    enabled: true,
    enforcement,
    isSystem: true,
    sortOrder,
  };
}

export const DEFAULT_DEPENDENCY_LIFECYCLE_TRANSITIONS: readonly DependencyLifecycleTransitionConfig[] =
  [
    edge("pending", "at_risk", 10),
    edge("pending", "met", 20),
    edge("pending", "waived", 30),
    edge("pending", "removed", 40),
    edge("at_risk", "pending", 10),
    edge("at_risk", "met", 20),
    edge("at_risk", "waived", 30),
  ];

/**
 * Fresh default dependency lifecycle graph.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultDependencyLifecycleConfig(): DependencyLifecycleConfig {
  return {
    statuses: DEFAULT_DEPENDENCY_LIFECYCLE_STATUSES.map((s) => ({ ...s })),
    transitions: DEFAULT_DEPENDENCY_LIFECYCLE_TRANSITIONS.map((t) => ({ ...t })),
  };
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
  }
  return null;
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
    if (!validateDependencyLifecycleConfig(candidate)) {
      return {
        statuses: candidate.statuses.map((s) => ({ ...s })),
        transitions: candidate.transitions.map((t) => ({ ...t })),
      };
    }
  }
  return createDefaultDependencyLifecycleConfig();
}

export const DEFAULT_DEPENDENCY_LIFECYCLE_CONFIG =
  createDefaultDependencyLifecycleConfig();
