/**
 * Per-user Conflicts lifecycle configuration (statuses + transitions + types).
 * Mirrors the enterprise Conflicts Lifecycle table; storage is Clerk-user scoped.
 */

export const CONFLICT_LIFECYCLE_ENFORCEMENTS = ["flexible", "required"] as const;
export type ConflictLifecycleEnforcement =
  (typeof CONFLICT_LIFECYCLE_ENFORCEMENTS)[number];

export const CONFLICT_EDIT_MODES = [
  "full",
  "limited",
  "read_only",
  "immutable",
] as const;
export type ConflictEditMode = (typeof CONFLICT_EDIT_MODES)[number];

export type ConflictLifecycleStatusConfig = {
  key: string;
  label: string;
  sortOrder: number;
  terminal: boolean;
  enabled: boolean;
  isSystem: boolean;
  editMode: ConflictEditMode;
  /** Cascade / notes shown in settings. */
  cascadeEffect: string;
  /** New conflict records land here. */
  isIntake: boolean;
};

export type ConflictLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: ConflictLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
};

export type ConflictTypeConfig = {
  key: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  isSystem: boolean;
  description: string;
};

export type ConflictLifecycleConfig = {
  statuses: ConflictLifecycleStatusConfig[];
  transitions: ConflictLifecycleTransitionConfig[];
  types: ConflictTypeConfig[];
};

export const MAX_CONFLICT_LIFECYCLE_STATUSES = 20;
export const MAX_CONFLICT_LIFECYCLE_TRANSITIONS = 80;
export const MAX_CONFLICT_TYPES = 20;

export const DEFAULT_CONFLICT_LIFECYCLE_STATUSES: readonly Omit<
  ConflictLifecycleStatusConfig,
  "isIntake"
>[] =
  [
    {
      key: "detected",
      label: "Detected",
      sortOrder: 10,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "System identified conflict",
    },
    {
      key: "under_review",
      label: "Under Review",
      sortOrder: 20,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Requires RM assessment",
    },
    {
      key: "resolved",
      label: "Resolved",
      sortOrder: 30,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — conflict addressed (AV-05 auto-detect on deploy date save)",
    },
    {
      key: "dismissed",
      label: "Dismissed",
      sortOrder: 40,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — false positive or accepted; requires justification",
    },
  ];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  enforcement: ConflictLifecycleEnforcement = "flexible"
): ConflictLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    enabled: true,
    enforcement,
    isSystem: true,
    sortOrder,
  };
}

export const DEFAULT_CONFLICT_LIFECYCLE_TRANSITIONS: readonly ConflictLifecycleTransitionConfig[] =
  [
    edge("detected", "under_review", 10),
    edge("detected", "resolved", 20),
    edge("detected", "dismissed", 30),
    edge("under_review", "resolved", 10),
    edge("under_review", "dismissed", 20),
  ];

export const DEFAULT_CONFLICT_TYPES: readonly ConflictTypeConfig[] = [
  {
    key: "schedule",
    label: "Schedule",
    sortOrder: 10,
    enabled: true,
    isSystem: true,
    description: "Same deploy window",
  },
  {
    key: "resource",
    label: "Resource",
    sortOrder: 20,
    enabled: true,
    isSystem: true,
    description: "Same environment",
  },
  {
    key: "application",
    label: "Application",
    sortOrder: 30,
    enabled: true,
    isSystem: true,
    description: "Same application",
  },
];

/**
 * Fresh default conflict lifecycle graph + types.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultConflictLifecycleConfig(): ConflictLifecycleConfig {
  return {
    statuses: DEFAULT_CONFLICT_LIFECYCLE_STATUSES.map((s) => ({
      ...s,
      isIntake: s.key === "detected",
    })),
    transitions: DEFAULT_CONFLICT_LIFECYCLE_TRANSITIONS.map((t) => ({ ...t })),
    types: DEFAULT_CONFLICT_TYPES.map((t) => ({ ...t })),
  };
}

/**
 * Validate conflict lifecycle graph before persistence / enforcement.
 * @returns null when valid, otherwise a user-safe error string.
 */
export function validateConflictLifecycleConfig(
  config: ConflictLifecycleConfig
): string | null {
  if (
    config.statuses.length < 1 ||
    config.statuses.length > MAX_CONFLICT_LIFECYCLE_STATUSES
  ) {
    return `Conflict lifecycle must contain 1–${MAX_CONFLICT_LIFECYCLE_STATUSES} statuses`;
  }
  if (config.transitions.length > MAX_CONFLICT_LIFECYCLE_TRANSITIONS) {
    return `Conflict lifecycle cannot exceed ${MAX_CONFLICT_LIFECYCLE_TRANSITIONS} transitions`;
  }
  if (!Array.isArray(config.types) || config.types.length > MAX_CONFLICT_TYPES) {
    return `Conflict lifecycle cannot exceed ${MAX_CONFLICT_TYPES} types`;
  }
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const status of config.statuses) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(status.key)) {
      return `Invalid conflict status key: ${status.key}`;
    }
    if (!status.label.trim()) return `Invalid label for ${status.key}`;
    if (keys.has(status.key)) return `Duplicate status key: ${status.key}`;
    const lower = status.label.trim().toLocaleLowerCase();
    if (labels.has(lower)) return `Duplicate status label: ${status.label}`;
    if (!CONFLICT_EDIT_MODES.includes(status.editMode)) {
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
    if (!CONFLICT_LIFECYCLE_ENFORCEMENTS.includes(item.enforcement)) {
      return `Invalid enforcement for ${item.fromKey} → ${item.toKey}`;
    }
    const edgeId = `${item.fromKey}:${item.toKey}`;
    if (edges.has(edgeId)) return `Duplicate transition: ${edgeId}`;
    edges.add(edgeId);
  }
  const typeKeys = new Set<string>();
  for (const type of config.types) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(type.key)) {
      return `Invalid conflict type key: ${type.key}`;
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
export function normalizeConflictLifecycleConfig(
  raw: unknown
): ConflictLifecycleConfig {
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as ConflictLifecycleConfig).statuses) &&
    Array.isArray((raw as ConflictLifecycleConfig).transitions) &&
    Array.isArray((raw as ConflictLifecycleConfig).types)
  ) {
    const candidate = raw as ConflictLifecycleConfig;
    if (!validateConflictLifecycleConfig(candidate)) {
      return {
        statuses: candidate.statuses.map((s) => ({
          ...s,
          isIntake: typeof s.isIntake === "boolean" ? s.isIntake : s.key === "detected",
        })),
        transitions: candidate.transitions.map((t) => ({ ...t })),
        types: candidate.types.map((t) => ({ ...t })),
      };
    }
  }
  return createDefaultConflictLifecycleConfig();
}

export const DEFAULT_CONFLICT_LIFECYCLE_CONFIG =
  createDefaultConflictLifecycleConfig();
