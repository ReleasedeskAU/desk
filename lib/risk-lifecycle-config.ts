/**
 * Per-user Risks lifecycle configuration (statuses + transitions).
 * Mirrors the enterprise Risks Lifecycle table; storage is Clerk-user scoped.
 */
import {
  isRiskLifecycleGateType,
  RISK_LIFECYCLE_GATE_ENFORCEMENTS,
  riskGate,
  type RiskLifecycleGateAttachment,
} from "@/lib/risk-lifecycle-gates";

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
  /** New risk records land here. */
  isIntake: boolean;
  /** Daily auto-escalate moves overdue risks into this status. */
  escalateTarget: boolean;
};

export type RiskLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: RiskLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
  gates: RiskLifecycleGateAttachment[];
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
    label: "Open",
    sortOrder: 10,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Probability and Impact required",
    escalateAfterDays: 3,
    isIntake: true,
    escalateTarget: false,
  },
  {
    key: "assessing",
    label: "In Progress",
    sortOrder: 20,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Risk Score calculated",
    escalateAfterDays: 3,
    isIntake: false,
    escalateTarget: false,
  },
  {
    key: "mitigating",
    label: "Mitigating",
    sortOrder: 30,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Mitigation Plan required for High severity",
    escalateAfterDays: null,
    isIntake: false,
    escalateTarget: false,
  },
  {
    key: "mitigated",
    label: "Monitoring",
    sortOrder: 40,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "limited",
    cascadeEffect: "Residual risk documented",
    escalateAfterDays: null,
    isIntake: false,
    escalateTarget: false,
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
    isIntake: false,
    escalateTarget: false,
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
    isIntake: false,
    escalateTarget: false,
  },
  {
    key: "escalated",
    label: "Escalated",
    sortOrder: 70,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Auto-escalated after 3 days",
    escalateAfterDays: null,
    isIntake: false,
    escalateTarget: true,
  },
];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  gates: RiskLifecycleGateAttachment[] = [],
  enforcement: RiskLifecycleEnforcement = "flexible"
): RiskLifecycleTransitionConfig {
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

export const DEFAULT_RISK_LIFECYCLE_TRANSITIONS: readonly RiskLifecycleTransitionConfig[] = [
  edge("identified", "assessing", 10, [riskGate("likelihood_impact_set", 10)]),
  edge("identified", "accepted", 20, [
    riskGate("likelihood_impact_set", 10),
    riskGate("acceptance_documented", 20),
  ]),
  edge("identified", "closed", 30, [riskGate("likelihood_impact_set", 10)]),
  edge("identified", "escalated", 40, [riskGate("likelihood_impact_set", 10)]),
  edge("assessing", "mitigating", 10, [riskGate("risk_score_calculated", 10)]),
  edge("assessing", "accepted", 20, [
    riskGate("risk_score_calculated", 10),
    riskGate("acceptance_documented", 20),
  ]),
  edge("assessing", "closed", 30, [riskGate("risk_score_calculated", 10)]),
  edge("assessing", "escalated", 40, [riskGate("risk_score_calculated", 10)]),
  edge("mitigating", "mitigated", 10, [riskGate("mitigation_plan_for_high", 10)]),
  edge("mitigating", "accepted", 20, [
    riskGate("mitigation_plan_for_high", 10),
    riskGate("acceptance_documented", 20),
  ]),
  edge("mitigating", "closed", 30, [riskGate("mitigation_plan_for_high", 10)]),
  edge("mitigating", "escalated", 40, [riskGate("mitigation_plan_for_high", 10)]),
  edge("mitigated", "accepted", 10, [
    riskGate("residual_risk_documented", 10),
    riskGate("acceptance_documented", 20),
  ]),
  edge("mitigated", "closed", 20, [riskGate("residual_risk_documented", 10)]),
  edge("mitigated", "mitigating", 30, [
    riskGate("residual_risk_documented", 10),
    riskGate("reversal_reason_set", 20),
  ]),
  edge("mitigated", "identified", 40, [riskGate("residual_risk_documented", 10)]),
  edge("accepted", "closed", 10),
  edge("accepted", "mitigated", 20),
  edge("accepted", "mitigating", 30, [riskGate("reversal_reason_set", 10)]),
  edge("escalated", "assessing", 10),
  edge("escalated", "mitigating", 20),
  edge("escalated", "accepted", 30, [riskGate("acceptance_documented", 10)]),
];

/**
 * Fresh default risk lifecycle graph.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultRiskLifecycleConfig(): RiskLifecycleConfig {
  return {
    statuses: DEFAULT_RISK_LIFECYCLE_STATUSES.map((s) => ({ ...s })),
    transitions: DEFAULT_RISK_LIFECYCLE_TRANSITIONS.map((t) => ({
      ...t,
      gates: t.gates.map((gate) => ({ ...gate })),
    })),
  };
}

function validateGates(
  item: RiskLifecycleTransitionConfig,
  fromKey: string,
  toKey: string
): string | null {
  const seen = new Set<string>();
  for (const gate of item.gates ?? []) {
    if (!isRiskLifecycleGateType(gate.gateType)) {
      return `Unknown check "${String(gate.gateType)}" on ${fromKey} → ${toKey}`;
    }
    if (seen.has(gate.gateType)) {
      return `Duplicate check ${gate.gateType} on ${fromKey} → ${toKey}`;
    }
    if (
      !RISK_LIFECYCLE_GATE_ENFORCEMENTS.includes(
        gate.enforcement as (typeof RISK_LIFECYCLE_GATE_ENFORCEMENTS)[number]
      )
    ) {
      return `Invalid check enforcement on ${fromKey} → ${toKey}`;
    }
    seen.add(gate.gateType);
  }
  return null;
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
    const gateError = validateGates(item, item.fromKey, item.toKey);
    if (gateError) return gateError;
  }
  return null;
}

function coerceTransition(
  raw: RiskLifecycleTransitionConfig
): RiskLifecycleTransitionConfig {
  const gates = Array.isArray(raw.gates)
    ? raw.gates
        .filter((gate) => isRiskLifecycleGateType(gate.gateType))
        .map((gate) => ({
          gateType: gate.gateType,
          enabled: Boolean(gate.enabled),
          enforcement: RISK_LIFECYCLE_GATE_ENFORCEMENTS.includes(
            gate.enforcement as (typeof RISK_LIFECYCLE_GATE_ENFORCEMENTS)[number]
          )
            ? gate.enforcement
            : "inherit",
          sortOrder: Number(gate.sortOrder) || 0,
        }))
    : [];
  return { ...raw, gates };
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
        statuses: candidate.statuses.map((s) => ({
          ...s,
          isIntake: typeof s.isIntake === "boolean" ? s.isIntake : s.key === "identified",
          escalateTarget:
            typeof s.escalateTarget === "boolean" ? s.escalateTarget : s.key === "escalated",
        })),
        transitions: candidate.transitions.map(coerceTransition),
      };
    }
  }
  return createDefaultRiskLifecycleConfig();
}

export const DEFAULT_RISK_LIFECYCLE_CONFIG = createDefaultRiskLifecycleConfig();
