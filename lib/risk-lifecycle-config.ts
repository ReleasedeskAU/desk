/**
 * Per-user Risks lifecycle configuration (statuses + transitions).
 * Mirrors the enterprise Risks Lifecycle table; storage is Clerk-user scoped.
 */

export const RISK_LIFECYCLE_ENFORCEMENTS = ["flexible", "required"] as const;
export type RiskLifecycleEnforcement =
  (typeof RISK_LIFECYCLE_ENFORCEMENTS)[number];

export const RISK_EDIT_MODES = ["full", "limited", "read_only", "immutable"] as const;
export type RiskEditMode = (typeof RISK_EDIT_MODES)[number];

export type RiskLifecycleStatusConfig = {
  key: string;
  label: string;
  sortOrder: number;
  terminal: boolean;
  enabled: boolean;
  isSystem: boolean;
  editMode: RiskEditMode;
  /** Short notes / score requirements shown in settings. */
  cascadeEffect: string;
  /** AV-02: auto-escalate after N days in this status (null = none). */
  escalateAfterDays: number | null;
};

export type RiskLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: RiskLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
};

export type RiskLifecycleConfig = {
  statuses: RiskLifecycleStatusConfig[];
  transitions: RiskLifecycleTransitionConfig[];
};

export const MAX_RISK_LIFECYCLE_STATUSES = 20;
export const MAX_RISK_LIFECYCLE_TRANSITIONS = 80;

/** High severity threshold on likelihood×impact (1–5 scale default → 15). */
export const RISK_HIGH_SCORE_THRESHOLD = 15;

export const DEFAULT_RISK_LIFECYCLE_STATUSES: readonly RiskLifecycleStatusConfig[] = [
  {
    key: "identified",
    label: "Identified",
    sortOrder: 10,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Probability and Impact required (§1-10, §1-11)",
    escalateAfterDays: 3,
  },
  {
    key: "assessing",
    label: "Assessing",
    sortOrder: 20,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Risk Score calculated (§2-08)",
    escalateAfterDays: 3,
  },
  {
    key: "mitigating",
    label: "Mitigating",
    sortOrder: 30,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Mitigation Plan required for High severity (VR-27)",
    escalateAfterDays: null,
  },
  {
    key: "mitigated",
    label: "Mitigated",
    sortOrder: 40,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "limited",
    cascadeEffect: "Residual risk documented",
    escalateAfterDays: null,
  },
  {
    key: "accepted",
    label: "Accepted",
    sortOrder: 50,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "read_only",
    cascadeEffect: "Requires documented acceptance",
    escalateAfterDays: null,
  },
  {
    key: "closed",
    label: "Closed",
    sortOrder: 60,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "FINAL — risk resolved/retired",
    escalateAfterDays: null,
  },
  {
    key: "escalated",
    label: "Escalated",
    sortOrder: 70,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Auto-escalated after 3 days (AV-02)",
    escalateAfterDays: null,
  },
];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  enforcement: RiskLifecycleEnforcement = "flexible"
): RiskLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    enabled: true,
    enforcement,
    isSystem: true,
    sortOrder,
  };
}

export const DEFAULT_RISK_LIFECYCLE_TRANSITIONS: readonly RiskLifecycleTransitionConfig[] = [
  edge("identified", "assessing", 10),
  edge("identified", "closed", 20),
  edge("identified", "escalated", 30),
  edge("assessing", "mitigating", 10),
  edge("assessing", "accepted", 20),
  edge("assessing", "closed", 30),
  edge("assessing", "escalated", 40),
  edge("mitigating", "mitigated", 10),
  edge("mitigating", "accepted", 20),
  edge("mitigating", "closed", 30),
  edge("mitigating", "escalated", 40),
  edge("mitigated", "accepted", 10),
  edge("mitigated", "closed", 20),
  edge("accepted", "closed", 10),
  edge("escalated", "mitigating", 10),
  edge("escalated", "accepted", 20),
];

/**
 * Fresh default risk lifecycle graph.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultRiskLifecycleConfig(): RiskLifecycleConfig {
  return {
    statuses: DEFAULT_RISK_LIFECYCLE_STATUSES.map((s) => ({ ...s })),
    transitions: DEFAULT_RISK_LIFECYCLE_TRANSITIONS.map((t) => ({ ...t })),
  };
}

/**
 * Validate risk lifecycle graph before persistence / enforcement.
 * @returns null when valid, otherwise a user-safe error string.
 */
export function validateRiskLifecycleConfig(
  config: RiskLifecycleConfig
): string | null {
  if (
    config.statuses.length < 1 ||
    config.statuses.length > MAX_RISK_LIFECYCLE_STATUSES
  ) {
    return `Risk lifecycle must contain 1–${MAX_RISK_LIFECYCLE_STATUSES} statuses`;
  }
  if (config.transitions.length > MAX_RISK_LIFECYCLE_TRANSITIONS) {
    return `Risk lifecycle cannot exceed ${MAX_RISK_LIFECYCLE_TRANSITIONS} transitions`;
  }
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const status of config.statuses) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(status.key)) {
      return `Invalid risk status key: ${status.key}`;
    }
    if (!status.label.trim()) return `Invalid label for ${status.key}`;
    if (keys.has(status.key)) return `Duplicate status key: ${status.key}`;
    const lower = status.label.trim().toLocaleLowerCase();
    if (labels.has(lower)) return `Duplicate status label: ${status.label}`;
    if (!RISK_EDIT_MODES.includes(status.editMode)) {
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
    if (!RISK_LIFECYCLE_ENFORCEMENTS.includes(item.enforcement)) {
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
export function normalizeRiskLifecycleConfig(raw: unknown): RiskLifecycleConfig {
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as RiskLifecycleConfig).statuses) &&
    Array.isArray((raw as RiskLifecycleConfig).transitions)
  ) {
    const candidate = raw as RiskLifecycleConfig;
    if (!validateRiskLifecycleConfig(candidate)) {
      return {
        statuses: candidate.statuses.map((s) => ({ ...s })),
        transitions: candidate.transitions.map((t) => ({ ...t })),
      };
    }
  }
  return createDefaultRiskLifecycleConfig();
}

export const DEFAULT_RISK_LIFECYCLE_CONFIG = createDefaultRiskLifecycleConfig();
