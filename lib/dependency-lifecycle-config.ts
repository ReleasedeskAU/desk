/**
 * Per-user Dependencies lifecycle configuration (statuses + transitions + checks).
 * Matches the enterprise Dependencies sheet: 10 statuses, Closed sole terminal.
 */
import {
  dependencyGate,
  isDependencyLifecycleGateType,
  DEPENDENCY_LIFECYCLE_GATE_ENFORCEMENTS,
  type DependencyLifecycleGateAttachment,
} from "@/lib/dependency-lifecycle-gates";

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

/** Display-only accountable role from the sheet — not Clerk-enforced. */
export const DEPENDENCY_STATUS_OWNER_HINT: Readonly<Record<string, string>> = {
  identified: "Release Manager",
  pending: "Release Manager",
  confirmed: "Both Release Managers",
  in_progress: "Dependency Owner",
  at_risk: "Release Manager",
  blocked: "Stakeholder",
  escalated: "Director",
  resolved: "Release Manager",
  removed: "Release Manager",
  closed: "Release Manager",
};

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
  /** When true, Hard deps in this status satisfy VR-18 (Ready/Deploying). */
  satisfiesHardGate: boolean;
  /** New dependency records land here. */
  isIntake: boolean;
  /** AV-04 lands here when the upstream release deploys. */
  autoResolvedOnDeploy: boolean;
  /** AV-26: if the upstream rolls back, rows in this status move to At Risk. */
  rollbackReopensAtRisk: boolean;
  /** AV-26 landing status (warning indicator). */
  atRiskWarning: boolean;
  /** Main-compat: this status reopens when a predecessor rolls back. */
  reopensOnPredecessorRollback?: boolean;
  /** Main-compat: AV-26 destination when a predecessor rolls back. */
  rollbackWarningTarget?: boolean;
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

const HANDLED_KEYS = new Set(["resolved", "removed", "closed"]);

function status(
  partial: Omit<
    DependencyLifecycleStatusConfig,
    | "isIntake"
    | "satisfiesHardGate"
    | "autoResolvedOnDeploy"
    | "rollbackReopensAtRisk"
    | "atRiskWarning"
    | "reopensOnPredecessorRollback"
    | "rollbackWarningTarget"
  >
): DependencyLifecycleStatusConfig {
  return {
    ...partial,
    isIntake: partial.key === "identified",
    satisfiesHardGate: HANDLED_KEYS.has(partial.key),
    autoResolvedOnDeploy: partial.key === "resolved",
    rollbackReopensAtRisk: partial.key === "resolved",
    atRiskWarning: partial.key === "at_risk",
    reopensOnPredecessorRollback: false,
    rollbackWarningTarget: partial.key === "at_risk",
  };
}

export const DEFAULT_DEPENDENCY_LIFECYCLE_STATUSES: readonly DependencyLifecycleStatusConfig[] =
  [
    status({
      key: "identified",
      label: "Identified",
      sortOrder: 10,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Starting status — dependency spotted, not yet confirmed",
    }),
    status({
      key: "pending",
      label: "Pending",
      sortOrder: 20,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Awaiting confirmation from the dependent party",
    }),
    status({
      key: "confirmed",
      label: "Confirmed",
      sortOrder: 30,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Both release managers must acknowledge before work starts",
    }),
    status({
      key: "in_progress",
      label: "In Progress",
      sortOrder: 40,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Hard dependencies still block Deploying (VR-18) until Resolved / Removed / Closed",
    }),
    status({
      key: "at_risk",
      label: "At Risk",
      sortOrder: 50,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Warning indicator — timeline in jeopardy (AV-26 lands here on rollback)",
    }),
    status({
      key: "blocked",
      label: "Blocked",
      sortOrder: 60,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Cannot proceed because of this dependency",
    }),
    status({
      key: "escalated",
      label: "Escalated",
      sortOrder: 70,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Needs management resolution",
    }),
    status({
      key: "resolved",
      label: "Resolved",
      sortOrder: 80,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "limited",
      cascadeEffect:
        "Handled — counts for VR-18. AV-04 auto-lands here on Deployed. VR-36 still freezes add/remove ≥ Ready. Archive to Closed when done.",
    }),
    status({
      key: "removed",
      label: "Removed",
      sortOrder: 90,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "limited",
      cascadeEffect:
        "Does not need to happen — counts for VR-18. Documented approval required. Archive to Closed when done.",
    }),
    status({
      key: "closed",
      label: "Closed",
      sortOrder: 100,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "Sole terminal — formal archive. Still counts as a met hard dependency.",
    }),
  ];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  gates: DependencyLifecycleGateAttachment[] = []
): DependencyLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    enabled: true,
    enforcement: "flexible",
    isSystem: true,
    sortOrder,
    gates,
  };
}

export const DEFAULT_DEPENDENCY_LIFECYCLE_TRANSITIONS: readonly DependencyLifecycleTransitionConfig[] =
  [
    edge("identified", "pending", 10),
    edge("identified", "confirmed", 20),
    edge("pending", "confirmed", 10),
    edge("pending", "removed", 20, [dependencyGate("notes_documented", 10)]),
    edge("confirmed", "in_progress", 10, [
      dependencyGate("both_parties_acknowledged", 10),
    ]),
    edge("in_progress", "at_risk", 10),
    edge("in_progress", "blocked", 20),
    edge("in_progress", "resolved", 30),
    edge("at_risk", "in_progress", 10),
    edge("at_risk", "blocked", 20),
    edge("at_risk", "resolved", 30),
    edge("blocked", "in_progress", 10),
    edge("blocked", "escalated", 20),
    edge("escalated", "blocked", 10),
    edge("escalated", "resolved", 20),
    edge("escalated", "removed", 30, [dependencyGate("notes_documented", 10)]),
    edge("resolved", "closed", 10),
    edge("removed", "closed", 10),
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
      gates: t.gates.map((g) => ({ ...g })),
    })),
  };
}

function cloneGate(
  gate: DependencyLifecycleGateAttachment
): DependencyLifecycleGateAttachment {
  return { ...gate };
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
    for (const gate of item.gates ?? []) {
      if (!isDependencyLifecycleGateType(gate.gateType)) {
        return `Unknown check on ${item.fromKey} → ${item.toKey}`;
      }
      if (!DEPENDENCY_LIFECYCLE_GATE_ENFORCEMENTS.includes(gate.enforcement)) {
        return `Invalid check enforcement on ${item.fromKey} → ${item.toKey}`;
      }
    }
  }
  return null;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Normalize stored JSON; reconcile toward the sheet, then fall back to default when invalid.
 * @param raw - Persisted snapshot or null.
 */
export function normalizeDependencyLifecycleConfig(
  raw: unknown
): DependencyLifecycleConfig {
  const defaults = createDefaultDependencyLifecycleConfig();
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray((raw as DependencyLifecycleConfig).statuses) ||
    !Array.isArray((raw as DependencyLifecycleConfig).transitions)
  ) {
    return defaults;
  }
  const candidate = raw as DependencyLifecycleConfig;
  const mapped: DependencyLifecycleConfig = {
    statuses: candidate.statuses.map((s) => {
      const def = defaults.statuses.find((d) => d.key === s.key);
      return {
        key: s.key,
        label: s.label,
        sortOrder: s.sortOrder,
        terminal: Boolean(s.terminal),
        enabled: s.enabled !== false,
        isSystem: Boolean(s.isSystem),
        editMode: DEPENDENCY_EDIT_MODES.includes(s.editMode)
          ? s.editMode
          : (def?.editMode ?? "full"),
        cascadeEffect: s.cascadeEffect ?? def?.cascadeEffect ?? "",
        satisfiesHardGate: coerceBoolean(
          s.satisfiesHardGate,
          def?.satisfiesHardGate ?? false
        ),
        isIntake: coerceBoolean(s.isIntake, def?.isIntake ?? false),
        autoResolvedOnDeploy: coerceBoolean(
          s.autoResolvedOnDeploy,
          def?.autoResolvedOnDeploy ?? false
        ),
        rollbackReopensAtRisk: coerceBoolean(
          s.rollbackReopensAtRisk,
          def?.rollbackReopensAtRisk ?? false
        ),
        atRiskWarning: coerceBoolean(s.atRiskWarning, def?.atRiskWarning ?? false),
        reopensOnPredecessorRollback: coerceBoolean(
          s.reopensOnPredecessorRollback,
          def?.reopensOnPredecessorRollback ?? false
        ),
        rollbackWarningTarget: coerceBoolean(
          s.rollbackWarningTarget,
          def?.rollbackWarningTarget ?? false
        ),
      };
    }),
    transitions: candidate.transitions.map((t) => ({
      fromKey: t.fromKey,
      toKey: t.toKey,
      enabled: t.enabled !== false,
      enforcement: DEPENDENCY_LIFECYCLE_ENFORCEMENTS.includes(t.enforcement)
        ? t.enforcement
        : "flexible",
      isSystem: Boolean(t.isSystem),
      sortOrder: t.sortOrder,
      gates: (t.gates ?? [])
        .filter((g) => isDependencyLifecycleGateType(g.gateType))
        .map(cloneGate),
    })),
  };
  const reconciled = mapped;
  if (!validateDependencyLifecycleConfig(reconciled)) return reconciled;
  return defaults;
}

export const DEFAULT_DEPENDENCY_LIFECYCLE_CONFIG =
  createDefaultDependencyLifecycleConfig();
