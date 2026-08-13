/**
 * Merge enterprise incident defaults into a stored per-user graph.
 * Additive: missing statuses, edges, and checks are inserted. Extra edges stay.
 */
import {
  createDefaultIncidentLifecycleConfig,
  type IncidentLifecycleConfig,
  type IncidentLifecycleTransitionConfig,
} from "@/lib/incident-lifecycle-config";
import type { IncidentLifecycleGateAttachment } from "@/lib/incident-lifecycle-gates";

function edgeId(item: Pick<IncidentLifecycleTransitionConfig, "fromKey" | "toKey">): string {
  return `${item.fromKey}:${item.toKey}`;
}

function cloneGate(gate: IncidentLifecycleGateAttachment): IncidentLifecycleGateAttachment {
  return { ...gate };
}

/**
 * Reconcile a stored incident config toward the shipped 8-status spec.
 * @param config - Current user graph (already normalized).
 * @returns Cloned config with missing system statuses, edges, and default checks.
 */
export function reconcileIncidentLifecycleSpec(
  config: IncidentLifecycleConfig
): IncidentLifecycleConfig {
  const defaults = createDefaultIncidentLifecycleConfig();
  const statuses = config.statuses.map((s) => ({ ...s }));
  const byKey = new Map(statuses.map((s) => [s.key, s]));

  for (const def of defaults.statuses) {
    const existing = byKey.get(def.key);
    if (!existing) {
      const copy = { ...def };
      statuses.push(copy);
      byKey.set(def.key, copy);
      continue;
    }
    existing.sortOrder = def.sortOrder;
    if (typeof existing.isIntake !== "boolean") existing.isIntake = def.isIntake;
    if (typeof existing.blocksLinkedRelease !== "boolean") {
      existing.blocksLinkedRelease = def.blocksLinkedRelease;
    }
    if (typeof existing.unblocksParent !== "boolean") {
      existing.unblocksParent = def.unblocksParent;
    }
    // Promote the shipped Open display label to Active when the user never renamed it.
    if (def.key === "open" && existing.label.trim().toLocaleLowerCase() === "open") {
      existing.label = def.label;
    }
  }

  const transitions = config.transitions.map((t) => ({
    ...t,
    gates: (t.gates ?? []).map(cloneGate),
  }));
  const byEdge = new Map(transitions.map((t) => [edgeId(t), t]));

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
    const have = new Set(existing.gates.map((g) => g.gateType));
    for (const gate of def.gates) {
      if (have.has(gate.gateType)) continue;
      existing.gates.push(cloneGate(gate));
      have.add(gate.gateType);
    }
  }

  return { statuses, transitions };
}
