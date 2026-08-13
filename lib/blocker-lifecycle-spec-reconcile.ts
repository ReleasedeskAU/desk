/**
 * Merge enterprise blocker defaults into a stored per-user graph.
 * Additive: missing statuses, edges, and checks are inserted. Extra edges stay.
 */
import {
  createDefaultBlockerLifecycleConfig,
  type BlockerLifecycleConfig,
  type BlockerLifecycleTransitionConfig,
} from "@/lib/blocker-lifecycle-config";
import type { BlockerLifecycleGateAttachment } from "@/lib/blocker-lifecycle-gates";

function edgeId(item: Pick<BlockerLifecycleTransitionConfig, "fromKey" | "toKey">): string {
  return `${item.fromKey}:${item.toKey}`;
}

function cloneGate(gate: BlockerLifecycleGateAttachment): BlockerLifecycleGateAttachment {
  return { ...gate };
}

/**
 * Reconcile a stored blocker config toward the shipped 9-status spec.
 * @param config - Current user graph (already normalized).
 * @returns Cloned config with missing system statuses, edges, and default checks.
 */
export function reconcileBlockerLifecycleSpec(
  config: BlockerLifecycleConfig
): BlockerLifecycleConfig {
  const defaults = createDefaultBlockerLifecycleConfig();
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
    if (existing.staleAlertDays == null && def.staleAlertDays != null) {
      existing.staleAlertDays = def.staleAlertDays;
    }
    if (typeof existing.isIntake !== "boolean") existing.isIntake = def.isIntake;
    if (typeof existing.unblocksParent !== "boolean") {
      existing.unblocksParent = def.unblocksParent;
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
