/**
 * Merge shipped Risk vocabulary, graph edges, and checks into stored configs.
 * Missing system items are additive; user-created edges and renamed labels stay.
 */
import {
  createDefaultRiskLifecycleConfig,
  type RiskLifecycleConfig,
  type RiskLifecycleTransitionConfig,
} from "@/lib/risk-lifecycle-config";
import type { RiskLifecycleGateAttachment } from "@/lib/risk-lifecycle-gates";

const PREVIOUS_DEFAULT_LABELS: Readonly<Record<string, string>> = {
  identified: "identified",
  assessing: "assessing",
  mitigated: "mitigated",
};

function edgeId(item: Pick<RiskLifecycleTransitionConfig, "fromKey" | "toKey">): string {
  return `${item.fromKey}:${item.toKey}`;
}

function cloneGate(gate: RiskLifecycleGateAttachment): RiskLifecycleGateAttachment {
  return { ...gate };
}

/**
 * Reconcile one stored Risk config toward the current enterprise specification.
 * @param config - Current normalized per-user graph.
 * @returns A cloned graph with missing defaults and untouched legacy labels updated.
 */
export function reconcileRiskLifecycleSpec(
  config: RiskLifecycleConfig
): RiskLifecycleConfig {
  const defaults = createDefaultRiskLifecycleConfig();
  const statuses = config.statuses.map((status) => ({ ...status }));
  const byKey = new Map(statuses.map((status) => [status.key, status]));

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
    const attached = new Set(existing.gates.map((gate) => gate.gateType));
    for (const gate of def.gates) {
      if (attached.has(gate.gateType)) continue;
      existing.gates.push(cloneGate(gate));
      attached.add(gate.gateType);
    }
  }

  return { statuses, transitions };
}
