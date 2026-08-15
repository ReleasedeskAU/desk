/**
 * Per-user Drift lifecycle configuration (statuses + transitions + checks).
 * Sheet graph plus live-only Reverted. Storage is Clerk-user scoped.
 */

import {
  driftGate,
  isDriftLifecycleGateType,
  DRIFT_LIFECYCLE_GATE_ENFORCEMENTS,
  type DriftLifecycleGateAttachment,
  type DriftLifecycleGateEnforcement,
} from "@/lib/drift-lifecycle-gates";

export const DRIFT_LIFECYCLE_ENFORCEMENTS = ["flexible", "required"] as const;
export type DriftLifecycleEnforcement =
  (typeof DRIFT_LIFECYCLE_ENFORCEMENTS)[number];

export const DRIFT_EDIT_MODES = [
  "full",
  "limited",
  "read_only",
  "immutable",
] as const;
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
  gates: DriftLifecycleGateAttachment[];
};

export type DriftLifecycleConfig = {
  statuses: DriftLifecycleStatusConfig[];
  transitions: DriftLifecycleTransitionConfig[];
};

export const MAX_DRIFT_LIFECYCLE_STATUSES = 20;
export const MAX_DRIFT_LIFECYCLE_TRANSITIONS = 80;

function driftStatus(
  partial: Omit<DriftLifecycleStatusConfig, "isIntake" | "escalateTarget">
): DriftLifecycleStatusConfig {
  return {
    ...partial,
    isIntake: partial.key === "detected",
    escalateTarget: partial.key === "escalated",
  };
}

export const DEFAULT_DRIFT_LIFECYCLE_STATUSES: readonly DriftLifecycleStatusConfig[] =
  [
    driftStatus({
      key: "detected",
      label: "Open",
      sortOrder: 10,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Delta found vs baseline — not yet being worked",
    }),
    driftStatus({
      key: "investigating",
      label: "In Progress",
      sortOrder: 20,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Manual review in progress",
    }),
    driftStatus({
      key: "scheduled",
      label: "Scheduled",
      sortOrder: 30,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Remediation planned for a future date",
    }),
    driftStatus({
      key: "escalated",
      label: "Escalated",
      sortOrder: 40,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Unauthorized change suspected — security alert (AV-14)",
    }),
    driftStatus({
      key: "approved",
      label: "Resolved",
      sortOrder: 50,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "limited",
      cascadeEffect: "Drift accepted as the new baseline — still editable until Closed",
    }),
    driftStatus({
      key: "closed",
      label: "Closed",
      sortOrder: 60,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — audit trail captured after Resolved",
    }),
    driftStatus({
      key: "reverted",
      label: "Reverted",
      sortOrder: 70,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — config restored; original baseline re-applied",
    }),
  ];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  enforcement: DriftLifecycleEnforcement = "flexible",
  gates: DriftLifecycleGateAttachment[] = []
): DriftLifecycleTransitionConfig {
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

const reviewGate = [driftGate("manual_review_set", 10)];
const etaGate = [driftGate("eta_to_fix_set", 10)];
const baselineGate = [driftGate("new_baseline_established", 10)];

export const DEFAULT_DRIFT_LIFECYCLE_TRANSITIONS: readonly DriftLifecycleTransitionConfig[] =
  [
    edge("detected", "investigating", 10, "flexible", reviewGate),
    edge("detected", "scheduled", 20, "flexible", etaGate),
    edge("detected", "escalated", 30),
    edge("detected", "approved", 40, "flexible", baselineGate),
    edge("detected", "reverted", 50),
    edge("investigating", "scheduled", 10, "flexible", etaGate),
    edge("investigating", "approved", 20, "flexible", baselineGate),
    edge("investigating", "escalated", 30),
    edge("investigating", "reverted", 40),
    edge("scheduled", "investigating", 10, "flexible", reviewGate),
    edge("scheduled", "approved", 20, "flexible", baselineGate),
    edge("scheduled", "escalated", 30),
    edge("escalated", "investigating", 10, "flexible", reviewGate),
    edge("escalated", "scheduled", 20, "flexible", etaGate),
    edge("escalated", "approved", 30, "flexible", baselineGate),
    edge("escalated", "reverted", 40),
    edge("approved", "closed", 10),
  ];

/**
 * Fresh default drift lifecycle graph.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultDriftLifecycleConfig(): DriftLifecycleConfig {
  return {
    statuses: DEFAULT_DRIFT_LIFECYCLE_STATUSES.map((s) => ({ ...s })),
    transitions: DEFAULT_DRIFT_LIFECYCLE_TRANSITIONS.map((t) => ({
      ...t,
      gates: t.gates.map((g) => ({ ...g })),
    })),
  };
}

function normalizeGates(raw: unknown): DriftLifecycleGateAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: DriftLifecycleGateAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<DriftLifecycleGateAttachment>;
    if (!isDriftLifecycleGateType(row.gateType)) continue;
    const enforcement = DRIFT_LIFECYCLE_GATE_ENFORCEMENTS.includes(
      row.enforcement as DriftLifecycleGateEnforcement
    )
      ? (row.enforcement as DriftLifecycleGateEnforcement)
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

function coerceStatus(raw: DriftLifecycleStatusConfig): DriftLifecycleStatusConfig {
  const defaults = DEFAULT_DRIFT_LIFECYCLE_STATUSES.find((s) => s.key === raw.key);
  return {
    ...raw,
    isIntake: typeof raw.isIntake === "boolean" ? raw.isIntake : raw.key === "detected",
    escalateTarget:
      typeof raw.escalateTarget === "boolean"
        ? raw.escalateTarget
        : Boolean(defaults?.escalateTarget),
  };
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
    const normalized: DriftLifecycleConfig = {
      statuses: candidate.statuses.map(coerceStatus),
      transitions: candidate.transitions.map((t) => ({
        ...t,
        gates: normalizeGates(t.gates),
      })),
    };
    if (!validateDriftLifecycleConfig(normalized)) {
      return normalized;
    }
  }
  return createDefaultDriftLifecycleConfig();
}

export const DEFAULT_DRIFT_LIFECYCLE_CONFIG = createDefaultDriftLifecycleConfig();
