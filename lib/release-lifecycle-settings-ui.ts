/**
 * Pure helpers for the Release Lifecycle Settings UI.
 * Keeps panel interactions testable without a browser and reuses engine validation.
 */
import {
  MAX_RELEASE_LIFECYCLE_STATUSES,
  PREVIOUS_STATUS_TARGET_KEY,
  releaseLifecycleTargetKey,
  validateReleaseLifecycleConfig,
  type ReleaseLifecycleConfig,
  type ReleaseLifecycleEnforcement,
  type ReleaseLifecycleStatusConfig,
  type ReleaseLifecycleStatusKind,
  type ReleaseLifecycleTransitionConfig,
} from "@/lib/release-lifecycle-config";
import {
  RELEASE_LIFECYCLE_GATE_CATALOG,
  type ReleaseLifecycleGateType,
} from "@/lib/release-lifecycle-gates";

/** Status keys that must remain present for the hard-gate rollout (CFG-06). */
export const HARD_BOUNDARY_STATUS_KEYS = ["deploying", "deployed"] as const;

/** Gates that always pass today — show an explicit “not yet enforced” label. */
export const ALWAYS_PASS_GATE_TYPES: ReadonlySet<ReleaseLifecycleGateType> = new Set([
  "environment_booked_for_deploy",
  "post_deployment_validation_complete",
]);

export type StatusUsageMap = Record<string, number>;

/**
 * Deep-clone a lifecycle config so Cancel / edit drafts never mutate the saved baseline.
 * @param config - Source graph.
 * @returns Independent deep copy.
 */
export function cloneLifecycleConfig(
  config: ReleaseLifecycleConfig
): ReleaseLifecycleConfig {
  return {
    statuses: config.statuses.map((status) => ({ ...status })),
    transitions: config.transitions.map((item) => ({
      ...item,
      gates: item.gates.map((gate) => ({
        ...gate,
        params: gate.params ? { ...gate.params } : undefined,
      })),
    })),
  };
}

/**
 * Build a stable slug key from a display label.
 * @param label - Human label.
 * @returns Snake-case key starting with a letter, or empty string if unusable.
 */
export function slugifyLifecycleStatusKey(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!base) return "";
  return /^[a-z]/.test(base) ? base : `s_${base}`.slice(0, 40);
}

/**
 * Whether a gate should show the “not yet enforced — always passes” warning.
 * @param gateType - Catalog gate type.
 */
export function isAlwaysPassLifecycleGate(gateType: ReleaseLifecycleGateType): boolean {
  if (ALWAYS_PASS_GATE_TYPES.has(gateType)) return true;
  return RELEASE_LIFECYCLE_GATE_CATALOG[gateType]?.dataReliability === "missing";
}

/**
 * Whether a status key is a hard-boundary default that must not be removed/renamed.
 * @param key - Status key.
 */
export function isHardBoundaryStatusKey(key: string): boolean {
  return (HARD_BOUNDARY_STATUS_KEYS as readonly string[]).includes(key);
}

/**
 * Decide if a status may be removed from the draft config.
 * System and hard-boundary statuses are never removable; custom ones need zero usage.
 *
 * @param status - Status candidate.
 * @param usageCount - Number of Release rows currently using this status (key or label).
 * @returns null when removable, otherwise a user-facing block reason.
 */
export function statusRemovalBlockReason(
  status: Pick<ReleaseLifecycleStatusConfig, "key" | "label" | "isSystem">,
  usageCount: number
): string | null {
  if (status.isSystem || isHardBoundaryStatusKey(status.key)) {
    return `"${status.label}" is a system default and cannot be removed.`;
  }
  if (usageCount > 0) {
    return `Cannot remove "${status.label}" — ${usageCount} release${
      usageCount === 1 ? "" : "s"
    } currently use this status. Move those releases to another status first.`;
  }
  return null;
}

/**
 * Remove a status and all transitions that reference it.
 * @param config - Draft config.
 * @param key - Status key to remove.
 * @param usageCount - In-use count from the server.
 * @returns Next config, or an error string.
 */
export function removeLifecycleStatus(
  config: ReleaseLifecycleConfig,
  key: string,
  usageCount: number
): { config: ReleaseLifecycleConfig } | { error: string } {
  const status = config.statuses.find((item) => item.key === key);
  if (!status) return { error: `Unknown status: ${key}` };
  const blocked = statusRemovalBlockReason(status, usageCount);
  if (blocked) return { error: blocked };

  const next: ReleaseLifecycleConfig = {
    statuses: config.statuses.filter((item) => item.key !== key),
    transitions: config.transitions.filter(
      (item) => item.fromKey !== key && item.toKey !== key
    ),
  };
  const validationError = validateReleaseLifecycleConfig(next);
  if (validationError) return { error: validationError };
  return { config: next };
}

/**
 * Add a custom status to the draft graph.
 * @param config - Draft config.
 * @param label - Display label.
 * @param terminal - Whether the status is terminal.
 */
export function addLifecycleStatus(
  config: ReleaseLifecycleConfig,
  label: string,
  terminal: boolean
): { config: ReleaseLifecycleConfig } | { error: string } {
  if (config.statuses.length >= MAX_RELEASE_LIFECYCLE_STATUSES) {
    return {
      error: `Lifecycle cannot exceed ${MAX_RELEASE_LIFECYCLE_STATUSES} statuses`,
    };
  }
  const trimmed = label.trim();
  if (!trimmed) return { error: "Status name is required" };
  let key = slugifyLifecycleStatusKey(trimmed);
  if (!key) return { error: "Status name must include letters or numbers" };
  const existing = new Set(config.statuses.map((item) => item.key));
  if (existing.has(key)) {
    let n = 2;
    while (existing.has(`${key}_${n}`) && n < 99) n += 1;
    key = `${key}_${n}`.slice(0, 40);
  }
  const kind: ReleaseLifecycleStatusKind = terminal ? "terminal" : "branch";
  const maxOrder = config.statuses.reduce(
    (max, item) => Math.max(max, item.sortOrder),
    0
  );
  const next: ReleaseLifecycleConfig = {
    ...config,
    statuses: [
      ...config.statuses,
      {
        key,
        label: trimmed.slice(0, 80),
        sortOrder: maxOrder + 10,
        terminal,
        kind,
        isSystem: false,
        enabled: true,
      },
    ],
  };
  const validationError = validateReleaseLifecycleConfig(next);
  if (validationError) return { error: validationError };
  return { config: next };
}

/**
 * Toggle a transition enabled flag, then re-validate.
 */
export function toggleLifecycleTransition(
  config: ReleaseLifecycleConfig,
  fromKey: string,
  targetKey: string,
  enabled: boolean
): { config: ReleaseLifecycleConfig } | { error: string } {
  const next = cloneLifecycleConfig(config);
  const item = next.transitions.find(
    (transition) =>
      transition.fromKey === fromKey &&
      releaseLifecycleTargetKey(transition) === targetKey
  );
  if (!item) return { error: "Unknown transition" };
  item.enabled = enabled;
  const validationError = validateReleaseLifecycleConfig(next);
  if (validationError) return { error: validationError };
  return { config: next };
}

/**
 * Set transition enforcement. Warns (does not block) when Required with no enabled gates.
 * @returns next config, optional warning, or error.
 */
export function setLifecycleTransitionEnforcement(
  config: ReleaseLifecycleConfig,
  fromKey: string,
  targetKey: string,
  enforcement: ReleaseLifecycleEnforcement
):
  | { config: ReleaseLifecycleConfig; warning: string | null }
  | { error: string } {
  const next = cloneLifecycleConfig(config);
  const item = next.transitions.find(
    (transition) =>
      transition.fromKey === fromKey &&
      releaseLifecycleTargetKey(transition) === targetKey
  );
  if (!item) return { error: "Unknown transition" };
  item.enforcement = enforcement;
  const validationError = validateReleaseLifecycleConfig(next);
  if (validationError) return { error: validationError };

  const enabledGates = item.gates.filter((gate) => gate.enabled);
  const warning =
    enforcement === "required" && enabledGates.length === 0
      ? "This transition is Required but has no gates attached. Nothing will be checked when someone moves along this path."
      : null;
  return { config: next, warning };
}

/**
 * Add a transition between two statuses.
 */
export function addLifecycleTransition(
  config: ReleaseLifecycleConfig,
  fromKey: string,
  toKey: string
): { config: ReleaseLifecycleConfig } | { error: string } {
  if (fromKey === toKey) return { error: "From and to status must differ" };
  const from = config.statuses.find((item) => item.key === fromKey);
  const to = config.statuses.find((item) => item.key === toKey);
  if (!from || !to) return { error: "Both statuses must exist" };
  if (from.terminal) return { error: "Terminal statuses cannot have outgoing transitions" };

  const edge = `${fromKey}:${toKey}`;
  if (
    config.transitions.some(
      (item) => releaseLifecycleTargetKey(item) === toKey && item.fromKey === fromKey
    )
  ) {
    return { error: `Transition already exists: ${edge}` };
  }

  const maxOrder = config.transitions
    .filter((item) => item.fromKey === fromKey)
    .reduce((max, item) => Math.max(max, item.sortOrder), 0);

  const transition: ReleaseLifecycleTransitionConfig = {
    fromKey,
    toKey,
    isPreviousStatus: false,
    enabled: true,
    enforcement: "flexible",
    isSystem: false,
    sortOrder: maxOrder + 10,
    gates: [],
  };
  const next: ReleaseLifecycleConfig = {
    ...config,
    transitions: [...config.transitions, transition],
  };
  const validationError = validateReleaseLifecycleConfig(next);
  if (validationError) return { error: validationError };
  return { config: next };
}

/**
 * Toggle a catalog gate on a transition (attach if missing when enabling).
 */
export function toggleLifecycleGate(
  config: ReleaseLifecycleConfig,
  fromKey: string,
  targetKey: string,
  gateType: ReleaseLifecycleGateType,
  enabled: boolean
): { config: ReleaseLifecycleConfig } | { error: string } {
  const next = cloneLifecycleConfig(config);
  const item = next.transitions.find(
    (transition) =>
      transition.fromKey === fromKey &&
      releaseLifecycleTargetKey(transition) === targetKey
  );
  if (!item) return { error: "Unknown transition" };

  const existing = item.gates.find((gate) => gate.gateType === gateType);
  if (existing) {
    existing.enabled = enabled;
  } else if (enabled) {
    const maxOrder = item.gates.reduce((max, gate) => Math.max(max, gate.sortOrder), 0);
    item.gates.push({
      gateType,
      enabled: true,
      enforcement: "inherit",
      sortOrder: maxOrder + 10,
    });
  } else {
    return { config: next };
  }

  const validationError = validateReleaseLifecycleConfig(next);
  if (validationError) return { error: validationError };
  return { config: next };
}

/**
 * Group transitions by from-status for list rendering.
 */
export function groupTransitionsByFrom(
  config: ReleaseLifecycleConfig
): Array<{
  from: ReleaseLifecycleStatusConfig;
  transitions: ReleaseLifecycleTransitionConfig[];
}> {
  const byKey = new Map(config.statuses.map((status) => [status.key, status]));
  const groups = new Map<string, ReleaseLifecycleTransitionConfig[]>();
  for (const item of config.transitions) {
    const list = groups.get(item.fromKey) ?? [];
    list.push(item);
    groups.set(item.fromKey, list);
  }
  return config.statuses
    .filter((status) => groups.has(status.key))
    .map((from) => ({
      from,
      transitions: (groups.get(from.key) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .concat(
      [...groups.keys()]
        .filter((key) => !byKey.has(key))
        .map((key) => ({
          from: {
            key,
            label: key,
            sortOrder: 0,
            terminal: false,
            kind: "branch" as const,
            isSystem: false,
            enabled: false,
          },
          transitions: (groups.get(key) ?? []).slice(),
        }))
    );
}

/** Display label for a transition target. */
export function transitionTargetLabel(
  transition: ReleaseLifecycleTransitionConfig,
  statuses: ReleaseLifecycleStatusConfig[]
): string {
  if (transition.isPreviousStatus || releaseLifecycleTargetKey(transition) === PREVIOUS_STATUS_TARGET_KEY) {
    return "Previous status";
  }
  return statuses.find((status) => status.key === transition.toKey)?.label ?? transition.toKey ?? "—";
}

export { releaseLifecycleTargetKey, validateReleaseLifecycleConfig };
