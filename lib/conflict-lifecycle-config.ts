/**
 * Per-user Conflicts lifecycle configuration (statuses + transitions + types).
 * Mirrors the enterprise Conflicts Lifecycle table; storage is Clerk-user scoped.
 */
import {
  conflictGate,
  isConflictLifecycleGateType,
  CONFLICT_LIFECYCLE_GATE_ENFORCEMENTS,
  type ConflictLifecycleGateAttachment,
} from "@/lib/conflict-lifecycle-gates";

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
  /** VR-32: unresolved statuses block Ready. */
  blocksReleaseReady: boolean;
};

export type ConflictLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: ConflictLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
  gates: ConflictLifecycleGateAttachment[];
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

const UNRESOLVED_KEYS = new Set([
  "detected",
  "under_review",
  "pending_review",
  "escalated",
]);

function status(args: {
  key: string;
  label: string;
  sortOrder: number;
  terminal?: boolean;
  editMode?: ConflictEditMode;
  cascadeEffect: string;
  isIntake?: boolean;
  blocksReleaseReady?: boolean;
}): ConflictLifecycleStatusConfig {
  return {
    key: args.key,
    label: args.label,
    sortOrder: args.sortOrder,
    terminal: args.terminal ?? false,
    enabled: true,
    isSystem: true,
    editMode: args.editMode ?? "full",
    cascadeEffect: args.cascadeEffect,
    isIntake: args.isIntake ?? false,
    blocksReleaseReady: args.blocksReleaseReady ?? UNRESOLVED_KEYS.has(args.key),
  };
}

export const DEFAULT_CONFLICT_LIFECYCLE_STATUSES: readonly ConflictLifecycleStatusConfig[] =
  [
    status({
      key: "detected",
      label: "Open",
      sortOrder: 10,
      cascadeEffect: "Intake — newly raised or auto-detected",
      isIntake: true,
      blocksReleaseReady: true,
    }),
    status({
      key: "under_review",
      label: "In Progress",
      sortOrder: 20,
      cascadeEffect: "Release Manager assessment required before review",
      blocksReleaseReady: true,
    }),
    status({
      key: "pending_review",
      label: "Pending Review",
      sortOrder: 30,
      cascadeEffect: "Waiting on a decision; still blocks Ready",
      blocksReleaseReady: true,
    }),
    status({
      key: "escalated",
      label: "Escalated",
      sortOrder: 40,
      cascadeEffect: "Higher-authority decision required",
      blocksReleaseReady: true,
    }),
    status({
      key: "resolved",
      label: "Resolved",
      sortOrder: 50,
      cascadeEffect: "Addressed — close when the record should freeze",
      blocksReleaseReady: false,
    }),
    status({
      key: "closed",
      label: "Closed",
      sortOrder: 60,
      terminal: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — conflict record is immutable",
      blocksReleaseReady: false,
    }),
    status({
      key: "dismissed",
      label: "Dismissed",
      sortOrder: 70,
      terminal: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — justification required, no override",
      blocksReleaseReady: false,
    }),
  ];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  gates: ConflictLifecycleGateAttachment[] = [],
  enforcement: ConflictLifecycleEnforcement = "flexible"
): ConflictLifecycleTransitionConfig {
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

export const DEFAULT_CONFLICT_LIFECYCLE_TRANSITIONS: readonly ConflictLifecycleTransitionConfig[] =
  [
    edge("detected", "under_review", 10),
    edge("detected", "escalated", 20),
    edge("under_review", "pending_review", 10, [conflictGate("rm_assessment_set", 10)]),
    edge("under_review", "escalated", 20, [conflictGate("rm_assessment_set", 10)]),
    edge("pending_review", "resolved", 10),
    edge("pending_review", "dismissed", 20, [
      conflictGate("dismissal_justification_set", 10, "required"),
    ], "required"),
    edge("pending_review", "under_review", 30),
    edge("escalated", "under_review", 10, [
      conflictGate("higher_authority_decision_set", 10),
    ]),
    edge("escalated", "resolved", 20, [
      conflictGate("higher_authority_decision_set", 10),
    ]),
    edge("escalated", "dismissed", 30, [
      conflictGate("higher_authority_decision_set", 10),
      conflictGate("dismissal_justification_set", 20, "required"),
    ], "required"),
    edge("resolved", "closed", 10),
  ];

export const DEFAULT_CONFLICT_TYPES: readonly ConflictTypeConfig[] = [
  {
    key: "schedule",
    label: "Schedule",
    sortOrder: 10,
    enabled: true,
    isSystem: true,
    description: "Same deploy day and shared application (AV-05)",
  },
  {
    key: "resource",
    label: "Resource",
    sortOrder: 20,
    enabled: true,
    isSystem: true,
    description: "Same environment resource",
  },
  {
    key: "application",
    label: "Application",
    sortOrder: 30,
    enabled: true,
    isSystem: true,
    description: "Same application",
  },
  {
    key: "environment_booking",
    label: "Environment Booking",
    sortOrder: 40,
    enabled: true,
    isSystem: true,
    description: "Booking calendar overlap on the same environment",
  },
  {
    key: "maintenance_window",
    label: "Maintenance Window",
    sortOrder: 50,
    enabled: true,
    isSystem: true,
    description: "Deploy window overlaps planned infrastructure maintenance",
  },
  {
    key: "freeze_period",
    label: "Freeze Period",
    sortOrder: 60,
    enabled: true,
    isSystem: true,
    description: "Target date falls inside a recorded freeze period",
  },
];

/**
 * Fresh default conflict lifecycle graph + types.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultConflictLifecycleConfig(): ConflictLifecycleConfig {
  return {
    statuses: DEFAULT_CONFLICT_LIFECYCLE_STATUSES.map((s) => ({ ...s })),
    transitions: DEFAULT_CONFLICT_LIFECYCLE_TRANSITIONS.map((t) => ({
      ...t,
      gates: t.gates.map((gate) => ({ ...gate })),
    })),
    types: DEFAULT_CONFLICT_TYPES.map((t) => ({ ...t })),
  };
}

function validateGates(
  item: ConflictLifecycleTransitionConfig,
  fromKey: string,
  toKey: string
): string | null {
  const seen = new Set<string>();
  for (const gate of item.gates ?? []) {
    if (!isConflictLifecycleGateType(gate.gateType)) {
      return `Unknown check "${String(gate.gateType)}" on ${fromKey} → ${toKey}`;
    }
    if (seen.has(gate.gateType)) {
      return `Duplicate check ${gate.gateType} on ${fromKey} → ${toKey}`;
    }
    if (
      !CONFLICT_LIFECYCLE_GATE_ENFORCEMENTS.includes(
        gate.enforcement as (typeof CONFLICT_LIFECYCLE_GATE_ENFORCEMENTS)[number]
      )
    ) {
      return `Invalid check enforcement on ${fromKey} → ${toKey}`;
    }
    seen.add(gate.gateType);
  }
  return null;
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
  for (const item of config.statuses) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(item.key)) {
      return `Invalid conflict status key: ${item.key}`;
    }
    if (!item.label.trim()) return `Invalid label for ${item.key}`;
    if (keys.has(item.key)) return `Duplicate status key: ${item.key}`;
    const lower = item.label.trim().toLocaleLowerCase();
    if (labels.has(lower)) return `Duplicate status label: ${item.label}`;
    if (!CONFLICT_EDIT_MODES.includes(item.editMode)) {
      return `Invalid editMode for ${item.key}`;
    }
    keys.add(item.key);
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
    const gateError = validateGates(item, item.fromKey, item.toKey);
    if (gateError) return gateError;
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

function coerceTransition(
  raw: ConflictLifecycleTransitionConfig
): ConflictLifecycleTransitionConfig {
  const gates = Array.isArray(raw.gates)
    ? raw.gates
        .filter((gate) => isConflictLifecycleGateType(gate.gateType))
        .map((gate) => ({
          gateType: gate.gateType,
          enabled: Boolean(gate.enabled),
          enforcement: CONFLICT_LIFECYCLE_GATE_ENFORCEMENTS.includes(
            gate.enforcement as (typeof CONFLICT_LIFECYCLE_GATE_ENFORCEMENTS)[number]
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
    const statuses = candidate.statuses.map((s) => ({
      ...s,
      isIntake: typeof s.isIntake === "boolean" ? s.isIntake : s.key === "detected",
      blocksReleaseReady:
        typeof s.blocksReleaseReady === "boolean"
          ? s.blocksReleaseReady
          : UNRESOLVED_KEYS.has(s.key),
    }));
    const normalized = {
      statuses,
      transitions: candidate.transitions.map(coerceTransition),
      types: candidate.types.map((t) => ({ ...t })),
    };
    if (!validateConflictLifecycleConfig(normalized)) {
      return normalized;
    }
  }
  return createDefaultConflictLifecycleConfig();
}

export const DEFAULT_CONFLICT_LIFECYCLE_CONFIG =
  createDefaultConflictLifecycleConfig();

/**
 * True when an enabled attached check is Required — Settings must not offer
 * Flexible (CFG-06 class). Driven by gate enforcement, not a status key.
 */
export function conflictTransitionEnforcementLocked(
  transition: ConflictLifecycleTransitionConfig
): boolean {
  return (transition.gates ?? []).some(
    (gate) => gate.enabled && gate.enforcement === "required"
  );
}
