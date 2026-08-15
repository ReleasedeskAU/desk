/**
 * Merge shipped Dependency vocabulary, graph edges, and checks into stored configs.
 * Missing system items are additive; user-created edges and renamed labels stay.
 */
import {
  createDefaultDependencyLifecycleConfig,
  type DependencyLifecycleConfig,
  type DependencyLifecycleTransitionConfig,
} from "@/lib/dependency-lifecycle-config";
import type { DependencyLifecycleGateAttachment } from "@/lib/dependency-lifecycle-gates";

function edgeId(
  item: Pick<DependencyLifecycleTransitionConfig, "fromKey" | "toKey">
): string {
  return `${item.fromKey}:${item.toKey}`;
}

function cloneGate(
  gate: DependencyLifecycleGateAttachment
): DependencyLifecycleGateAttachment {
  return { ...gate };
}

/**
 * Reconcile one stored Dependency config toward the current enterprise specification.
 * @param config - Current normalized per-user graph.
 * @returns A cloned graph with missing defaults; user Off toggles and labels stay.
 */
export function reconcileDependencyLifecycleSpec(
  config: DependencyLifecycleConfig
): DependencyLifecycleConfig {
  const defaults = createDefaultDependencyLifecycleConfig();
  const statuses = config.statuses.map((item) => ({ ...item }));
  const byKey = new Map(statuses.map((item) => [item.key, item]));
  const addedKeys = new Set<string>();

  for (const def of defaults.statuses) {
    const existing = byKey.get(def.key);
    if (!existing) {
      const copy = { ...def };
      // Do not add a second Starting status when the tenant already set one.
      if (copy.isIntake && statuses.some((s) => s.enabled && s.isIntake)) {
        copy.isIntake = false;
      }
      statuses.push(copy);
      byKey.set(def.key, copy);
      addedKeys.add(def.key);
      continue;
    }
    if (typeof existing.isIntake !== "boolean") existing.isIntake = def.isIntake;
    if (typeof existing.satisfiesHardGate !== "boolean") {
      existing.satisfiesHardGate = def.satisfiesHardGate;
    }
    if (typeof existing.reopensOnPredecessorRollback !== "boolean") {
      existing.reopensOnPredecessorRollback = def.reopensOnPredecessorRollback;
    }
    if (typeof existing.rollbackWarningTarget !== "boolean") {
      existing.rollbackWarningTarget = def.rollbackWarningTarget;
    }
  }

  // Old default used Pending as intake. Move it to Identified only when we
  // just added Identified and Pending is still the sole starting status.
  const identified = byKey.get("identified");
  const pending = byKey.get("pending");
  if (
    addedKeys.has("identified") &&
    identified &&
    pending?.isIntake &&
    statuses.filter((s) => s.enabled && s.isIntake).length === 1
  ) {
    identified.isIntake = true;
    pending.isIntake = false;
  }

  const transitions = config.transitions.map((transition) => ({
    ...transition,
    gates: (transition.gates ?? []).map(cloneGate),
  }));
  const byEdge = new Map(
    transitions.map((transition) => [edgeId(transition), transition])
  );

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
