/**
 * Per-user Incidents lifecycle configuration (statuses + transitions).
 * Mirrors the enterprise Incidents Lifecycle table; storage is Clerk-user scoped.
 */
import {
  incidentGate,
  isIncidentLifecycleGateType,
  INCIDENT_LIFECYCLE_GATE_ENFORCEMENTS,
  type IncidentLifecycleGateAttachment,
} from "@/lib/incident-lifecycle-gates";

export const INCIDENT_LIFECYCLE_ENFORCEMENTS = ["flexible", "required"] as const;
export type IncidentLifecycleEnforcement =
  (typeof INCIDENT_LIFECYCLE_ENFORCEMENTS)[number];

export const INCIDENT_EDIT_MODES = ["full", "limited", "read_only", "immutable"] as const;
export type IncidentEditMode = (typeof INCIDENT_EDIT_MODES)[number];

export type IncidentLifecycleStatusConfig = {
  key: string;
  label: string;
  sortOrder: number;
  terminal: boolean;
  enabled: boolean;
  isSystem: boolean;
  editMode: IncidentEditMode;
  /** Cascade / notes shown in settings. */
  cascadeEffect: string;
  /** New incident records land here. */
  isIntake: boolean;
  /** While in this status, a linked release cannot start Deploying (AV-06). */
  blocksLinkedRelease: boolean;
  /** Entering this status can auto-unblock the parent release. */
  unblocksParent: boolean;
};

export type IncidentLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: IncidentLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
  gates: IncidentLifecycleGateAttachment[];
};

export type IncidentLifecycleConfig = {
  statuses: IncidentLifecycleStatusConfig[];
  transitions: IncidentLifecycleTransitionConfig[];
};

export const MAX_INCIDENT_LIFECYCLE_STATUSES = 20;
export const MAX_INCIDENT_LIFECYCLE_TRANSITIONS = 80;

const INCIDENT_BLOCKS_RELEASE_KEYS = new Set([
  "open",
  "acknowledged",
  "investigating",
  "escalated",
  "resolving",
  "reopened",
]);

function incidentStatus(
  partial: Omit<
    IncidentLifecycleStatusConfig,
    "isIntake" | "blocksLinkedRelease" | "unblocksParent"
  >
): IncidentLifecycleStatusConfig {
  return {
    ...partial,
    isIntake: partial.key === "open",
    blocksLinkedRelease: INCIDENT_BLOCKS_RELEASE_KEYS.has(partial.key),
    unblocksParent: partial.key === "resolved",
  };
}

export const DEFAULT_INCIDENT_LIFECYCLE_STATUSES: readonly IncidentLifecycleStatusConfig[] =
  [
    incidentStatus({
      key: "open",
      label: "Active",
      sortOrder: 10,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Critical incidents need an owner before leaving (VR-13)",
    }),
    incidentStatus({
      key: "acknowledged",
      label: "Acknowledged",
      sortOrder: 15,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Responder confirmation required",
    }),
    incidentStatus({
      key: "investigating",
      label: "Investigating",
      sortOrder: 20,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Links to release if deployment-related",
    }),
    incidentStatus({
      key: "escalated",
      label: "Escalated",
      sortOrder: 30,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Higher visibility",
    }),
    incidentStatus({
      key: "resolving",
      label: "Resolving",
      sortOrder: 40,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "May block linked release",
    }),
    incidentStatus({
      key: "resolved",
      label: "Resolved",
      sortOrder: 50,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "limited",
      cascadeEffect: "Critical incidents unblock release",
    }),
    incidentStatus({
      key: "closed",
      label: "Closed",
      sortOrder: 60,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "FINAL — verified complete",
    }),
    incidentStatus({
      key: "reopened",
      label: "Reopened",
      sortOrder: 70,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "May re-trigger release blocks",
    }),
  ];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  gates: IncidentLifecycleGateAttachment[] = [],
  enforcement: IncidentLifecycleEnforcement = "flexible"
): IncidentLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    enabled: true,
    enforcement,
    isSystem: true,
    sortOrder,
    gates: gates.map((g) => ({ ...g })),
  };
}

export const DEFAULT_INCIDENT_LIFECYCLE_TRANSITIONS: readonly IncidentLifecycleTransitionConfig[] =
  [
    edge("open", "acknowledged", 10, [
      incidentGate("responder_confirmation_set", 10),
    ]),
    edge("open", "investigating", 20),
    edge("acknowledged", "investigating", 10),
    edge("acknowledged", "resolved", 20),
    edge("investigating", "resolving", 10),
    edge("investigating", "escalated", 20),
    edge("investigating", "closed", 30),
    edge("investigating", "resolved", 40),
    edge("escalated", "investigating", 10),
    edge("escalated", "resolving", 20),
    edge("escalated", "closed", 30),
    edge("escalated", "resolved", 40),
    edge("resolving", "resolved", 10),
    edge("resolving", "escalated", 20),
    edge("resolved", "closed", 10),
    edge("resolved", "reopened", 20),
    edge("reopened", "investigating", 10),
  ];

/**
 * Fresh default incident lifecycle graph.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultIncidentLifecycleConfig(): IncidentLifecycleConfig {
  return {
    statuses: DEFAULT_INCIDENT_LIFECYCLE_STATUSES.map((s) => ({ ...s })),
    transitions: DEFAULT_INCIDENT_LIFECYCLE_TRANSITIONS.map((t) => ({
      ...t,
      gates: t.gates.map((g) => ({ ...g })),
    })),
  };
}

function validateGates(
  item: IncidentLifecycleTransitionConfig,
  fromKey: string,
  toKey: string
): string | null {
  const seen = new Set<string>();
  for (const gate of item.gates ?? []) {
    if (!isIncidentLifecycleGateType(gate.gateType)) {
      return `Unknown check "${String(gate.gateType)}" on ${fromKey} → ${toKey}`;
    }
    if (seen.has(gate.gateType)) {
      return `Duplicate check ${gate.gateType} on ${fromKey} → ${toKey}`;
    }
    seen.add(gate.gateType);
  }
  return null;
}

/**
 * Validate incident lifecycle graph before persistence / enforcement.
 * @returns null when valid, otherwise a user-safe error string.
 */
export function validateIncidentLifecycleConfig(
  config: IncidentLifecycleConfig
): string | null {
  if (
    config.statuses.length < 1 ||
    config.statuses.length > MAX_INCIDENT_LIFECYCLE_STATUSES
  ) {
    return `Incident lifecycle must contain 1–${MAX_INCIDENT_LIFECYCLE_STATUSES} statuses`;
  }
  if (config.transitions.length > MAX_INCIDENT_LIFECYCLE_TRANSITIONS) {
    return `Incident lifecycle cannot exceed ${MAX_INCIDENT_LIFECYCLE_TRANSITIONS} transitions`;
  }
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const status of config.statuses) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(status.key)) {
      return `Invalid incident status key: ${status.key}`;
    }
    if (!status.label.trim()) return `Invalid label for ${status.key}`;
    if (keys.has(status.key)) return `Duplicate status key: ${status.key}`;
    const lower = status.label.trim().toLocaleLowerCase();
    if (labels.has(lower)) return `Duplicate status label: ${status.label}`;
    if (!INCIDENT_EDIT_MODES.includes(status.editMode)) {
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
    if (!INCIDENT_LIFECYCLE_ENFORCEMENTS.includes(item.enforcement)) {
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
  raw: IncidentLifecycleTransitionConfig
): IncidentLifecycleTransitionConfig {
  const gates = Array.isArray(raw.gates)
    ? raw.gates
        .filter((g) => isIncidentLifecycleGateType(g.gateType))
        .map((g) => ({
          gateType: g.gateType,
          enabled: Boolean(g.enabled),
          enforcement: INCIDENT_LIFECYCLE_GATE_ENFORCEMENTS.includes(
            g.enforcement as (typeof INCIDENT_LIFECYCLE_GATE_ENFORCEMENTS)[number]
          )
            ? g.enforcement
            : "inherit",
          sortOrder: Number(g.sortOrder) || 0,
        }))
    : [];
  return { ...raw, gates };
}

/**
 * Normalize stored JSON; fall back to enterprise default when invalid.
 * @param raw - Persisted snapshot or null.
 */
export function normalizeIncidentLifecycleConfig(
  raw: unknown
): IncidentLifecycleConfig {
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as IncidentLifecycleConfig).statuses) &&
    Array.isArray((raw as IncidentLifecycleConfig).transitions)
  ) {
    const candidate = raw as IncidentLifecycleConfig;
    if (!validateIncidentLifecycleConfig(candidate)) {
      return {
        statuses: candidate.statuses.map((s) => ({
          ...s,
          isIntake: typeof s.isIntake === "boolean" ? s.isIntake : s.key === "open",
          blocksLinkedRelease:
            typeof s.blocksLinkedRelease === "boolean"
              ? s.blocksLinkedRelease
              : INCIDENT_BLOCKS_RELEASE_KEYS.has(s.key),
          unblocksParent:
            typeof s.unblocksParent === "boolean"
              ? s.unblocksParent
              : s.key === "resolved",
        })),
        transitions: candidate.transitions.map((t) => coerceTransition(t)),
      };
    }
  }
  return createDefaultIncidentLifecycleConfig();
}

export const DEFAULT_INCIDENT_LIFECYCLE_CONFIG =
  createDefaultIncidentLifecycleConfig();
