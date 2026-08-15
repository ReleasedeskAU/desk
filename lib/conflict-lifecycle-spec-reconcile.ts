/**
 * Merge shipped Conflict vocabulary, graph edges, types, and checks into stored configs.
 * Missing system items are additive; user-created edges and renamed labels stay.
 */
import {
  createDefaultConflictLifecycleConfig,
  type ConflictLifecycleConfig,
  type ConflictLifecycleTransitionConfig,
  type ConflictTypeConfig,
} from "@/lib/conflict-lifecycle-config";
import type { ConflictLifecycleGateAttachment } from "@/lib/conflict-lifecycle-gates";

const PREVIOUS_DEFAULT_LABELS: Readonly<Record<string, string>> = {
  detected: "detected",
  under_review: "under review",
};

function edgeId(item: Pick<ConflictLifecycleTransitionConfig, "fromKey" | "toKey">): string {
  return `${item.fromKey}:${item.toKey}`;
}

function cloneGate(gate: ConflictLifecycleGateAttachment): ConflictLifecycleGateAttachment {
  return { ...gate };
}

/**
 * Reconcile one stored Conflict config toward the current enterprise specification.
 * @param config - Current normalized per-user graph.
 * @returns A cloned graph with missing defaults and untouched legacy labels updated.
 */
export function reconcileConflictLifecycleSpec(
  config: ConflictLifecycleConfig
): ConflictLifecycleConfig {
  const defaults = createDefaultConflictLifecycleConfig();
  const statuses = config.statuses.map((item) => ({ ...item }));
  const byKey = new Map(statuses.map((item) => [item.key, item]));

  for (const def of defaults.statuses) {
    const existing = byKey.get(def.key);
    if (!existing) {
      const copy = { ...def };
      statuses.push(copy);
      byKey.set(def.key, copy);
      continue;
    }
    if (typeof existing.isIntake !== "boolean") existing.isIntake = def.isIntake;
    if (typeof existing.blocksReleaseReady !== "boolean") {
      existing.blocksReleaseReady = def.blocksReleaseReady;
    }
    const oldLabel = PREVIOUS_DEFAULT_LABELS[def.key];
    if (oldLabel && existing.label.trim().toLocaleLowerCase() === oldLabel) {
      existing.label = def.label;
    }
    if (def.key === "resolved" && existing.terminal && existing.isSystem) {
      // Sheet: Resolved is working, not final. Only flip untouched system defaults.
      existing.terminal = false;
      if (existing.editMode === "immutable") existing.editMode = "full";
    }
  }

  const transitions = config.transitions.map((transition) => ({
    ...transition,
    gates: (transition.gates ?? []).map(cloneGate),
  }));
  const byEdge = new Map(transitions.map((transition) => [edgeId(transition), transition]));

  for (const def of defaults.transitions) {
    const existing = byEdge.get(edgeId(def));
    if (!existing) {
      const copy = {
        ...def,
        gates: def.gates.map(cloneGate),
      };
      transitions.push(copy);
      byEdge.set(edgeId(def), copy);
      continue;
    }
    if (def.enforcement === "required") {
      existing.enforcement = "required";
    }
    const attached = new Set(existing.gates.map((gate) => gate.gateType));
    for (const gate of def.gates) {
      if (attached.has(gate.gateType)) continue;
      existing.gates.push(cloneGate(gate));
      attached.add(gate.gateType);
    }
  }

  const types = config.types.map((type) => ({ ...type }));
  const typeKeys = new Set(types.map((type) => type.key));
  for (const def of defaults.types) {
    if (typeKeys.has(def.key)) continue;
    types.push({ ...def } satisfies ConflictTypeConfig);
    typeKeys.add(def.key);
  }

  return { statuses, transitions, types };
}
