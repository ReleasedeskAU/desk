/**
 * Per-user Sign-off lifecycle configuration (statuses + transitions + types).
 * Mirrors the enterprise Sign-Offs Lifecycle table; storage is Clerk-user scoped.
 * Status values are stored on Release checklist fields (devSignoff, etc.).
 */

export const SIGNOFF_LIFECYCLE_ENFORCEMENTS = ["flexible", "required"] as const;
export type SignoffLifecycleEnforcement =
  (typeof SIGNOFF_LIFECYCLE_ENFORCEMENTS)[number];

export const SIGNOFF_EDIT_MODES = ["full", "limited", "read_only", "immutable"] as const;
export type SignoffEditMode = (typeof SIGNOFF_EDIT_MODES)[number];

/** Release columns that can hold a sign-off decision value. */
export const SIGNOFF_RELEASE_FIELDS = [
  "devSignoff",
  "testSignoff",
  "uatSignoff",
  "securityClearance",
  "businessSignoff",
  "opsSignoff",
  "dressRehearsal",
  "trainingStatus",
  "supportBriefed",
] as const;
export type SignoffReleaseField = (typeof SIGNOFF_RELEASE_FIELDS)[number];

export type SignoffLifecycleStatusConfig = {
  key: string;
  label: string;
  sortOrder: number;
  terminal: boolean;
  enabled: boolean;
  isSystem: boolean;
  editMode: SignoffEditMode;
  /** Short cascade / notes shown in settings. */
  cascadeEffect: string;
  /** When true, this status counts as a completed sign-off for CAB gates. */
  countsAsComplete: boolean;
  /**
   * Sign-off SLA: auto-expire after N days in this status (null = none).
   * Mirrors Approval `expiryDays`; Pending defaults to 30.
   */
  expiryDays: number | null;
  /** New / empty checklist cells land here. */
  isIntake: boolean;
};

export type SignoffLifecycleTransitionConfig = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  enforcement: SignoffLifecycleEnforcement;
  isSystem: boolean;
  sortOrder: number;
};

export type SignoffTypeConfig = {
  key: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  isSystem: boolean;
  /** When true, required for Pending CAB / signoffs_complete gate. */
  mandatory: boolean;
  /** Release column that stores this type's decision (null = config-only). */
  releaseField: SignoffReleaseField | null;
};

export type SignoffLifecycleConfig = {
  statuses: SignoffLifecycleStatusConfig[];
  transitions: SignoffLifecycleTransitionConfig[];
  types: SignoffTypeConfig[];
};

export const MAX_SIGNOFF_LIFECYCLE_STATUSES = 20;
export const MAX_SIGNOFF_LIFECYCLE_TRANSITIONS = 80;
export const MAX_SIGNOFF_TYPES = 20;

export const DEFAULT_SIGNOFF_LIFECYCLE_STATUSES: readonly Omit<
  SignoffLifecycleStatusConfig,
  "isIntake"
>[] = [
  {
    key: "pending",
    label: "Pending",
    sortOrder: 10,
    terminal: false,
    enabled: true,
    isSystem: true,
    editMode: "full",
    cascadeEffect: "Awaiting signatory action; 30-day SLA expiry",
    countsAsComplete: false,
    expiryDays: 30,
  },
  {
    key: "approved",
    label: "Approved",
    sortOrder: 20,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "Required for Pending CAB transition",
    countsAsComplete: true,
    expiryDays: null,
  },
  {
    key: "rejected",
    label: "Rejected",
    sortOrder: 30,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "Blocks CAB submission",
    countsAsComplete: false,
    expiryDays: null,
  },
  {
    key: "approved_with_conditions",
    label: "Approved with Conditions",
    sortOrder: 40,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "Conditions must be tracked",
    countsAsComplete: true,
    expiryDays: null,
  },
  {
    key: "withdrawn",
    label: "Withdrawn",
    sortOrder: 50,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "Manual withdrawal",
    countsAsComplete: false,
    expiryDays: null,
  },
  {
    key: "expired",
    label: "Expired",
    sortOrder: 60,
    terminal: true,
    enabled: true,
    isSystem: true,
    editMode: "immutable",
    cascadeEffect: "Auto-expired when SLA exceeded",
    countsAsComplete: false,
    expiryDays: null,
  },
];

function edge(
  fromKey: string,
  toKey: string,
  sortOrder: number,
  enforcement: SignoffLifecycleEnforcement = "flexible"
): SignoffLifecycleTransitionConfig {
  return {
    fromKey,
    toKey,
    enabled: true,
    enforcement,
    isSystem: true,
    sortOrder,
  };
}

export const DEFAULT_SIGNOFF_LIFECYCLE_TRANSITIONS: readonly SignoffLifecycleTransitionConfig[] =
  [
    edge("pending", "approved", 10),
    edge("pending", "rejected", 20),
    edge("pending", "approved_with_conditions", 30),
    edge("pending", "withdrawn", 40),
    // SLA auto-expiry path (not a normal manual exit).
    edge("pending", "expired", 50, "required"),
  ];

export const DEFAULT_SIGNOFF_TYPES: readonly SignoffTypeConfig[] = [
  {
    key: "dev",
    label: "Dev",
    sortOrder: 10,
    enabled: true,
    isSystem: true,
    mandatory: true,
    releaseField: "devSignoff",
  },
  {
    key: "test",
    label: "Test",
    sortOrder: 20,
    enabled: true,
    isSystem: true,
    mandatory: true,
    releaseField: "testSignoff",
  },
  {
    key: "uat",
    label: "UAT",
    sortOrder: 30,
    enabled: true,
    isSystem: true,
    mandatory: true,
    releaseField: "uatSignoff",
  },
  {
    key: "security",
    label: "Security",
    sortOrder: 40,
    enabled: true,
    isSystem: true,
    mandatory: true,
    releaseField: "securityClearance",
  },
  {
    key: "business",
    label: "Business",
    sortOrder: 50,
    enabled: true,
    isSystem: true,
    mandatory: false,
    releaseField: "businessSignoff",
  },
  {
    key: "ops",
    label: "Ops",
    sortOrder: 60,
    enabled: true,
    isSystem: true,
    mandatory: false,
    releaseField: "opsSignoff",
  },
  {
    key: "dress_rehearsal",
    label: "Dress Rehearsal",
    sortOrder: 70,
    enabled: true,
    isSystem: true,
    mandatory: false,
    releaseField: "dressRehearsal",
  },
  {
    key: "training",
    label: "Training",
    sortOrder: 80,
    enabled: true,
    isSystem: true,
    mandatory: false,
    releaseField: "trainingStatus",
  },
];

/**
 * Fresh default sign-off lifecycle graph + types.
 * @returns Independent deep copy of the enterprise default.
 */
export function createDefaultSignoffLifecycleConfig(): SignoffLifecycleConfig {
  return {
    statuses: DEFAULT_SIGNOFF_LIFECYCLE_STATUSES.map((s) => ({
      ...s,
      isIntake: s.key === "pending",
    })),
    transitions: DEFAULT_SIGNOFF_LIFECYCLE_TRANSITIONS.map((t) => ({ ...t })),
    types: DEFAULT_SIGNOFF_TYPES.map((t) => ({ ...t })),
  };
}

/**
 * Validate sign-off lifecycle graph before persistence / enforcement.
 * @returns null when valid, otherwise a user-safe error string.
 */
export function validateSignoffLifecycleConfig(
  config: SignoffLifecycleConfig
): string | null {
  if (
    config.statuses.length < 1 ||
    config.statuses.length > MAX_SIGNOFF_LIFECYCLE_STATUSES
  ) {
    return `Sign-off lifecycle must contain 1–${MAX_SIGNOFF_LIFECYCLE_STATUSES} statuses`;
  }
  if (config.transitions.length > MAX_SIGNOFF_LIFECYCLE_TRANSITIONS) {
    return `Sign-off lifecycle cannot exceed ${MAX_SIGNOFF_LIFECYCLE_TRANSITIONS} transitions`;
  }
  if (!Array.isArray(config.types) || config.types.length > MAX_SIGNOFF_TYPES) {
    return `Sign-off lifecycle cannot exceed ${MAX_SIGNOFF_TYPES} types`;
  }
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const status of config.statuses) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(status.key)) {
      return `Invalid sign-off status key: ${status.key}`;
    }
    if (!status.label.trim()) return `Invalid label for ${status.key}`;
    if (keys.has(status.key)) return `Duplicate status key: ${status.key}`;
    const lower = status.label.trim().toLocaleLowerCase();
    if (labels.has(lower)) return `Duplicate status label: ${status.label}`;
    if (!SIGNOFF_EDIT_MODES.includes(status.editMode)) {
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
    // Terminal sources cannot have enabled outgoing edges.
    if (item.enabled && from.terminal) {
      return `Enabled transition ${item.fromKey} → ${item.toKey} leaves a terminal status`;
    }
    if (item.enabled && (!from.enabled || !to.enabled)) {
      return `Enabled transition ${item.fromKey} → ${item.toKey} uses a disabled status`;
    }
    if (!SIGNOFF_LIFECYCLE_ENFORCEMENTS.includes(item.enforcement)) {
      return `Invalid enforcement for ${item.fromKey} → ${item.toKey}`;
    }
    const edgeId = `${item.fromKey}:${item.toKey}`;
    if (edges.has(edgeId)) return `Duplicate transition: ${edgeId}`;
    edges.add(edgeId);
  }
  const typeKeys = new Set<string>();
  const usedFields = new Set<string>();
  for (const type of config.types) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(type.key)) {
      return `Invalid sign-off type key: ${type.key}`;
    }
    if (!type.label.trim()) return `Invalid label for type ${type.key}`;
    if (typeKeys.has(type.key)) return `Duplicate type key: ${type.key}`;
    if (
      type.releaseField != null &&
      !SIGNOFF_RELEASE_FIELDS.includes(type.releaseField)
    ) {
      return `Invalid releaseField for type ${type.key}`;
    }
    if (type.releaseField) {
      if (usedFields.has(type.releaseField)) {
        return `Release field ${type.releaseField} mapped to more than one sign-off type`;
      }
      usedFields.add(type.releaseField);
    }
    typeKeys.add(type.key);
  }
  return null;
}

/**
 * Normalize stored JSON; fall back to enterprise default when invalid.
 * @param raw - Persisted snapshot or null.
 */
export function normalizeSignoffLifecycleConfig(
  raw: unknown
): SignoffLifecycleConfig {
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as SignoffLifecycleConfig).statuses) &&
    Array.isArray((raw as SignoffLifecycleConfig).transitions) &&
    Array.isArray((raw as SignoffLifecycleConfig).types)
  ) {
    const candidate = raw as SignoffLifecycleConfig;
    if (!validateSignoffLifecycleConfig(candidate)) {
      // Backfill expiryDays for older stored configs (Pending → 30).
      const defaultsByKey = new Map(
        DEFAULT_SIGNOFF_LIFECYCLE_STATUSES.map((s) => [s.key, s] as const)
      );
      return {
        statuses: candidate.statuses.map((s) => ({
          ...s,
          expiryDays:
            typeof s.expiryDays === "number" || s.expiryDays === null
              ? s.expiryDays
              : (defaultsByKey.get(s.key)?.expiryDays ?? null),
          isIntake: typeof s.isIntake === "boolean" ? s.isIntake : s.key === "pending",
        })),
        transitions: candidate.transitions.map((t) => ({ ...t })),
        types: candidate.types.map((t) => ({ ...t })),
      };
    }
  }
  return createDefaultSignoffLifecycleConfig();
}

export const DEFAULT_SIGNOFF_LIFECYCLE_CONFIG =
  createDefaultSignoffLifecycleConfig();
