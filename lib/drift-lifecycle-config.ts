/**
 * Per-user Drift lifecycle configuration (statuses + transitions).
 * Mirrors the enterprise Drift Lifecycle table; storage is Clerk-user scoped.
 */

export const DRIFT_LIFECYCLE_ENFORCEMENTS = ["flexible", "required"] as const;
export type DriftLifecycleEnforcement =
  (typeof DRIFT_LIFECYCLE_ENFORCEMENTS)[number];

export const DRIFT_EDIT_MODES = ["full", "limited", "read_only", "immutable"] as const;
export type DriftEditMode = (typeof DRIFT_EDIT_MODES)[number];

export type DriftLifecycleStatusConfig = {
  key: string;
  label: string;
  sortOrder: number;
  terminal: boolean;
  enabled: boolean;
  isSystem: boolean;
  editMode: DriftEditMode;
  /** Detection / cascade notes shown in settings. */
  cascadeEffect: string;
  /** New drift records land here. */
  isIntake: boolean;
  /** Auto-escalate / AV-14 security alert lands here. */
  escalateTarget: boolean;
};

export type DriftLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: DriftLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
};

export type DriftLifecycleConfig = {
  statuses: DriftLifecycleStatusConfig[];
  transitions: DriftLifecycleTransitionConfig[];
};

export const MAX_DRIFT_LIFECYCLE_STATUSES = 20;
export const MAX_DRIFT_LIFECYCLE_TRANSITIONS = 80;

export const DEFAULT_DRIFT_LIFECYCLE_STATUSES: readonly Omit<
  DriftLifecycleStatusConfig,
  "isIntake" | "escalateTarget"
>[] = [
  {
    key: "detected",
    label: "Detected",
    sortOrder: 10,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Delta found vs baseline — daily scan job (AV-13)",
  },
  {
    key: "investigating",
    label: "Investigating",
    sortOrder: 20,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Manual review required to determine cause",
  },
  {
    key: "approved",
    label: "Approved",
    sortOrder: 30,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "FINAL — drift is intentional; new baseline established",
  },
  {
    key: "reverted",
    label: "Reverted",
    sortOrder: 40,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "FINAL — config restored; baseline re-applied",
  },
  {
    key: "escalated",
    label: "Escalated",
    sortOrder: 50,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Unauthorized change suspected — security alert (AV-14)",
  },
];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  enforcement: DriftLifecycleEnforcement = "flexible"
): DriftLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    enabled: true,
    enforcement,
    isSystem: true,
    sortOrder,
  };
}

export const DEFAULT_DRIFT_LIFECYCLE_TRANSITIONS: readonly DriftLifecycleTransitionConfig[] =
  [
    edge("detected", "investigating", 10),
    edge("detected", "approved", 20),
    edge("detected", "reverted", 30),
    edge("investigating", "approved", 10),
    edge("investigating", "reverted", 20),
    edge("investigating", "escalated", 30),
    edge("escalated", "investigating", 10),
    edge("escalated", "approved", 20),
    edge("escalated", "reverted", 30),
  ];

/**
 * Fresh default drift lifecycle graph.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultDriftLifecycleConfig(): DriftLifecycleConfig {
  return {
    statuses: DEFAULT_DRIFT_LIFECYCLE_STATUSES.map((s) => ({
      ...s,
      isIntake: s.key === "detected",
      escalateTarget: s.key === "escalated",
    })),
    transitions: DEFAULT_DRIFT_LIFECYCLE_TRANSITIONS.map((t) => ({ ...t })),
  };
}

/**
 * Validate drift lifecycle graph before persistence / enforcement.
 * @returns null when valid, otherwise a user-safe error string.
 */
export function validateDriftLifecycleConfig(
  config: DriftLifecycleConfig
): string | null {
  if (
    config.statuses.length < 1 ||
    config.statuses.length > MAX_DRIFT_LIFECYCLE_STATUSES
  ) {
    return `Drift lifecycle must contain 1–${MAX_DRIFT_LIFECYCLE_STATUSES} statuses`;
  }
  if (config.transitions.length > MAX_DRIFT_LIFECYCLE_TRANSITIONS) {
    return `Drift lifecycle cannot exceed ${MAX_DRIFT_LIFECYCLE_TRANSITIONS} transitions`;
  }
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const status of config.statuses) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(status.key)) {
      return `Invalid drift status key: ${status.key}`;
    }
    if (!status.label.trim()) return `Invalid label for ${status.key}`;
    if (keys.has(status.key)) return `Duplicate status key: ${status.key}`;
    const lower = status.label.trim().toLocaleLowerCase();
    if (labels.has(lower)) return `Duplicate status label: ${status.label}`;
    if (!DRIFT_EDIT_MODES.includes(status.editMode)) {
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
    if (!DRIFT_LIFECYCLE_ENFORCEMENTS.includes(item.enforcement)) {
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
export function normalizeDriftLifecycleConfig(raw: unknown): DriftLifecycleConfig {
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as DriftLifecycleConfig).statuses) &&
    Array.isArray((raw as DriftLifecycleConfig).transitions)
  ) {
    const candidate = raw as DriftLifecycleConfig;
    if (!validateDriftLifecycleConfig(candidate)) {
      return {
        statuses: candidate.statuses.map((s) => ({
          ...s,
          isIntake: typeof s.isIntake === "boolean" ? s.isIntake : s.key === "detected",
          escalateTarget:
            typeof s.escalateTarget === "boolean" ? s.escalateTarget : s.key === "escalated",
        })),
        transitions: candidate.transitions.map((t) => ({ ...t })),
      };
    }
  }
  return createDefaultDriftLifecycleConfig();
}

export const DEFAULT_DRIFT_LIFECYCLE_CONFIG = createDefaultDriftLifecycleConfig();
