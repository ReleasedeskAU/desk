/**
 * Per-user Blocker lifecycle configuration (statuses + transitions + checks).
 * Storage is Clerk-user scoped JSON snapshots.
 */
import {
  BLOCKER_LIFECYCLE_GATE_ENFORCEMENTS,
  blockerGate,
  isBlockerLifecycleGateType,
  type BlockerLifecycleGateAttachment,
} from "@/lib/blocker-lifecycle-gates";

export const BLOCKER_LIFECYCLE_ENFORCEMENTS = ["flexible", "required"] as const;
export type BlockerLifecycleEnforcement =
  (typeof BLOCKER_LIFECYCLE_ENFORCEMENTS)[number];

export const BLOCKER_EDIT_MODES = ["full", "limited", "read_only", "immutable"] as const;
export type BlockerEditMode = (typeof BLOCKER_EDIT_MODES)[number];

/** Display-only accountable role from the sheet — not enforced this pass. */
export const BLOCKER_STATUS_OWNER_HINT: Readonly<Record<string, string>> = {
  open: "Release Manager",
  assigned: "Blocker Owner",
  in_progress: "Blocker Owner",
  pending: "Blocker Owner",
  escalated: "Manager",
  resolved: "Blocker Owner",
  closed: "Release Manager",
  cancelled: "Release Manager",
  reopened: "Blocker Owner",
};

export type BlockerLifecycleStatusConfig = {
  key: string;
  label: string;
  sortOrder: number;
  terminal: boolean;
  enabled: boolean;
  isSystem: boolean;
  editMode: BlockerEditMode;
  cascadeEffect: string;
  blocksReleaseReady: boolean;
  staleAlertDays: number | null;
  /** New blocker records land here. */
  isIntake: boolean;
  /** Entering this status can auto-unblock the parent release (CASC-02). */
  unblocksParent: boolean;
};

export type BlockerLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: BlockerLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
  gates: BlockerLifecycleGateAttachment[];
};

export type BlockerLifecycleConfig = {
  statuses: BlockerLifecycleStatusConfig[];
  transitions: BlockerLifecycleTransitionConfig[];
};

export const MAX_BLOCKER_LIFECYCLE_STATUSES = 20;
export const MAX_BLOCKER_LIFECYCLE_TRANSITIONS = 80;

function status(
  partial: Omit<BlockerLifecycleStatusConfig, "isIntake" | "unblocksParent">
): BlockerLifecycleStatusConfig {
  return {
    ...partial,
    isIntake: partial.key === "open",
    unblocksParent: partial.key === "resolved",
  };
}

export const DEFAULT_BLOCKER_LIFECYCLE_STATUSES: readonly BlockerLifecycleStatusConfig[] =
  [
    status({
      key: "open",
      label: "Open",
      sortOrder: 10,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Blocks release transition to Ready",
      blocksReleaseReady: true,
      staleAlertDays: null,
    }),
    status({
      key: "assigned",
      label: "Assigned",
      sortOrder: 20,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Owner designated — assignment required to start work",
      blocksReleaseReady: true,
      staleAlertDays: null,
    }),
    status({
      key: "in_progress",
      label: "In Progress",
      sortOrder: 30,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Stale alert after 5 days (AV-03)",
      blocksReleaseReady: true,
      staleAlertDays: 5,
    }),
    status({
      key: "pending",
      label: "Pending",
      sortOrder: 40,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Awaiting external input",
      blocksReleaseReady: true,
      staleAlertDays: null,
    }),
    status({
      key: "escalated",
      label: "Escalated",
      sortOrder: 50,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "Higher visibility",
      blocksReleaseReady: true,
      staleAlertDays: null,
    }),
    status({
      key: "resolved",
      label: "Resolved",
      sortOrder: 60,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "limited",
      cascadeEffect: "May auto-unblock release (CASC-02). Resolution details locked.",
      blocksReleaseReady: false,
      staleAlertDays: null,
    }),
    status({
      key: "closed",
      label: "Closed",
      sortOrder: 70,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "Release unblocked if all resolved/closed. Terminal, immutable (§3-09).",
      blocksReleaseReady: false,
      staleAlertDays: null,
    }),
    status({
      key: "cancelled",
      label: "Cancelled",
      sortOrder: 80,
      terminal: true,
      enabled: true,
      isSystem: true,
      editMode: "immutable",
      cascadeEffect: "Invalid / withdrawn blocker. No cascade.",
      blocksReleaseReady: false,
      staleAlertDays: null,
    }),
    status({
      key: "reopened",
      label: "Reopened",
      sortOrder: 90,
      terminal: false,
      enabled: true,
      isSystem: true,
      editMode: "full",
      cascadeEffect: "May re-block release after a failed fix",
      blocksReleaseReady: true,
      staleAlertDays: null,
    }),
  ];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  gates: BlockerLifecycleGateAttachment[] = [],
  enforcement: BlockerLifecycleEnforcement = "flexible",
  /** Sheet next-steps On; optional Cancelled/Reopened shortcuts Off by default. */
  enabled = true
): BlockerLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    enabled,
    enforcement,
    isSystem: true,
    sortOrder,
    gates: gates.map((g) => ({ ...g })),
  };
}

/**
 * Blocker transition defaults.
 * Sheet next-steps are On; Cancelled / Reopened / Open→In Progress stay in the
 * graph (Settings toggles) but Off so Edit Status matches the sheet.
 */
export const DEFAULT_BLOCKER_LIFECYCLE_TRANSITIONS: readonly BlockerLifecycleTransitionConfig[] =
  [
    // Sheet: Open → Assigned, Escalated
    edge("open", "assigned", 10, [blockerGate("assignee_set", 10)]),
    edge("open", "escalated", 20),
    edge("open", "in_progress", 30, [blockerGate("assignee_set", 10)], "flexible", false),
    edge("open", "cancelled", 40, [], "flexible", false),
    // Sheet: Assigned → In Progress
    edge("assigned", "in_progress", 10, [blockerGate("assignee_set", 10)]),
    // Sheet: In Progress → Pending, Resolved, Escalated
    edge("in_progress", "pending", 10, [blockerGate("pending_reason_set", 10)]),
    edge("in_progress", "resolved", 20),
    edge("in_progress", "escalated", 30),
    edge("in_progress", "cancelled", 40, [], "flexible", false),
    // Sheet: Pending → In Progress, Escalated
    edge("pending", "in_progress", 10),
    edge("pending", "escalated", 20),
    // Sheet: Escalated → In Progress, Resolved
    edge("escalated", "in_progress", 10),
    edge("escalated", "resolved", 20),
    edge("escalated", "cancelled", 30, [], "flexible", false),
    // Sheet: Resolved → Closed
    edge("resolved", "closed", 10),
    edge("resolved", "reopened", 20, [], "flexible", false),
    edge("reopened", "in_progress", 10, [], "flexible", false),
  ];

/**
 * Fresh default blocker lifecycle graph.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultBlockerLifecycleConfig(): BlockerLifecycleConfig {
  return {
    statuses: DEFAULT_BLOCKER_LIFECYCLE_STATUSES.map((s) => ({ ...s })),
    transitions: DEFAULT_BLOCKER_LIFECYCLE_TRANSITIONS.map((t) => ({
      ...t,
      gates: t.gates.map((g) => ({ ...g })),
    })),
  };
}

function validateGates(
  item: BlockerLifecycleTransitionConfig,
  fromKey: string,
  toKey: string
): string | null {
  const seen = new Set<string>();
  for (const gate of item.gates ?? []) {
    if (!isBlockerLifecycleGateType(gate.gateType)) {
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
 * Validate blocker lifecycle graph before persistence / enforcement.
 * @returns null when valid, otherwise a user-safe error string.
 */
export function validateBlockerLifecycleConfig(
  config: BlockerLifecycleConfig
): string | null {
  if (
    config.statuses.length < 1 ||
    config.statuses.length > MAX_BLOCKER_LIFECYCLE_STATUSES
  ) {
    return `Blocker lifecycle must contain 1–${MAX_BLOCKER_LIFECYCLE_STATUSES} statuses`;
  }
  if (config.transitions.length > MAX_BLOCKER_LIFECYCLE_TRANSITIONS) {
    return `Blocker lifecycle cannot exceed ${MAX_BLOCKER_LIFECYCLE_TRANSITIONS} transitions`;
  }
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const item of config.statuses) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(item.key)) {
      return `Invalid blocker status key: ${item.key}`;
    }
    if (!item.label.trim()) return `Invalid label for ${item.key}`;
    if (keys.has(item.key)) return `Duplicate status key: ${item.key}`;
    const lower = item.label.trim().toLocaleLowerCase();
    if (labels.has(lower)) return `Duplicate status label: ${item.label}`;
    if (!BLOCKER_EDIT_MODES.includes(item.editMode)) {
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
    if (!BLOCKER_LIFECYCLE_ENFORCEMENTS.includes(item.enforcement)) {
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
  raw: BlockerLifecycleTransitionConfig
): BlockerLifecycleTransitionConfig {
  const gates = Array.isArray(raw.gates)
    ? raw.gates.filter((g) => isBlockerLifecycleGateType(g.gateType)).map((g) => ({
        gateType: g.gateType,
        enabled: Boolean(g.enabled),
        enforcement: BLOCKER_LIFECYCLE_GATE_ENFORCEMENTS.includes(
          g.enforcement as typeof BLOCKER_LIFECYCLE_GATE_ENFORCEMENTS[number]
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
export function normalizeBlockerLifecycleConfig(
  raw: unknown
): BlockerLifecycleConfig {
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as BlockerLifecycleConfig).statuses) &&
    Array.isArray((raw as BlockerLifecycleConfig).transitions)
  ) {
    const candidate: BlockerLifecycleConfig = {
      statuses: (raw as BlockerLifecycleConfig).statuses.map((s) => ({
        ...s,
        isIntake: typeof s.isIntake === "boolean" ? s.isIntake : s.key === "open",
        unblocksParent:
          typeof s.unblocksParent === "boolean" ? s.unblocksParent : s.key === "resolved",
      })),
      transitions: (raw as BlockerLifecycleConfig).transitions.map(coerceTransition),
    };
    if (!validateBlockerLifecycleConfig(candidate)) {
      return candidate;
    }
  }
  return createDefaultBlockerLifecycleConfig();
}

export const DEFAULT_BLOCKER_LIFECYCLE_CONFIG =
  createDefaultBlockerLifecycleConfig();
