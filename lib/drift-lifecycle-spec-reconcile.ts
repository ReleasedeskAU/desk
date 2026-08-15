/**
 * Merge shipped Drift vocabulary, graph edges, and checks into stored configs.
 * Missing system items are additive; user-created edges and renamed labels stay.
 */
import {
  createDefaultDriftLifecycleConfig,
  type DriftLifecycleConfig,
  type DriftLifecycleTransitionConfig,
} from "@/lib/drift-lifecycle-config";
import type { DriftLifecycleGateAttachment } from "@/lib/drift-lifecycle-gates";

const PREVIOUS_DEFAULT_LABELS: Readonly<Record<string, string>> = {
  detected: "detected",
  investigating: "investigating",
  approved: "approved",
};

function edgeId(item: Pick<DriftLifecycleTransitionConfig, "fromKey" | "toKey">): string {
  return `${item.fromKey}:${item.toKey}`;
}

function cloneGate(gate: DriftLifecycleGateAttachment): DriftLifecycleGateAttachment {
  return { ...gate };
}

/**
 * Reconcile one stored Drift config toward the current enterprise specification.
 * @param config - Current normalized per-user graph
 * @returns A cloned graph with missing defaults and untouched legacy labels updated
 */
export function reconcileDriftLifecycleSpec(
  config: DriftLifecycleConfig
): DriftLifecycleConfig {
  const defaults = createDefaultDriftLifecycleConfig();
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
    if (typeof existing.escalateTarget !== "boolean") {
      existing.escalateTarget = def.escalateTarget;
    }
    const oldLabel = PREVIOUS_DEFAULT_LABELS[def.key];
    if (oldLabel && existing.label.trim().toLocaleLowerCase() === oldLabel) {
      existing.label = def.label;
    }
    if (def.key === "approved" && existing.terminal && existing.isSystem) {
      // Sheet: Resolved is working, not final. Only flip untouched system defaults.
      existing.terminal = false;
      if (existing.editMode === "immutable") existing.editMode = "limited";
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

  return { statuses, transitions };
}
