/**
 * Rebuild a stored dependency graph to the sheet’s 10 statuses.
 * Strict: Met → Resolved, Waived → Removed, extra statuses/edges dropped.
 */
import {
  createDefaultDependencyLifecycleConfig,
  type DependencyLifecycleConfig,
  type DependencyLifecycleStatusConfig,
  type DependencyLifecycleTransitionConfig,
} from "@/lib/dependency-lifecycle-config";
import type { DependencyLifecycleGateAttachment } from "@/lib/dependency-lifecycle-gates";

function edgeId(
  item: Pick<DependencyLifecycleTransitionConfig, "fromKey" | "toKey">
): string {
  return `${item.fromKey}:${item.toKey}`;
}

function remapStatusKey(key: string): string {
  if (key === "met") return "resolved";
  if (key === "waived") return "removed";
  return key;
}

function cloneGate(
  gate: DependencyLifecycleGateAttachment
): DependencyLifecycleGateAttachment {
  return { ...gate };
}

function overlayStatus(
  def: DependencyLifecycleStatusConfig,
  stored: DependencyLifecycleStatusConfig | undefined
): DependencyLifecycleStatusConfig {
  if (!stored) return { ...def };
  const storedLabel = stored.label.trim();
  const label =
    def.key === "resolved" && storedLabel.toLocaleLowerCase() === "met"
      ? def.label
      : storedLabel || def.label;
  return {
    ...def,
    label,
    enabled: stored.enabled !== false,
  };
}

function mergeGates(
  defaults: DependencyLifecycleGateAttachment[],
  stored: DependencyLifecycleGateAttachment[]
): DependencyLifecycleGateAttachment[] {
  const byType = new Map<string, DependencyLifecycleGateAttachment>();
  for (const gate of defaults) byType.set(gate.gateType, cloneGate(gate));
  for (const gate of stored) {
    const existing = byType.get(gate.gateType);
    if (existing) {
      existing.enabled = gate.enabled;
      existing.enforcement = gate.enforcement;
    } else {
      byType.set(gate.gateType, cloneGate(gate));
    }
  }
  return [...byType.values()];
}

/**
 * Reconcile a stored dependency config to the shipped 10-status spec.
 * @param config - Current user graph (already field-normalized).
 * @returns Sheet graph: 10 statuses, sheet edges, missing checks added.
 */
export function reconcileDependencyLifecycleSpec(
  config: DependencyLifecycleConfig
): DependencyLifecycleConfig {
  const defaults = createDefaultDependencyLifecycleConfig();
  const storedByKey = new Map<string, DependencyLifecycleStatusConfig>();
  for (const status of config.statuses) {
    const key = remapStatusKey(status.key);
    if (!storedByKey.has(key)) storedByKey.set(key, { ...status, key });
  }

  const statuses = defaults.statuses.map((def) =>
    overlayStatus(def, storedByKey.get(def.key))
  );

  const storedEdges = new Map<string, DependencyLifecycleTransitionConfig>();
  for (const item of config.transitions) {
    const fromKey = remapStatusKey(item.fromKey);
    const toKey = remapStatusKey(item.toKey);
    if (fromKey === toKey) continue;
    const remapped = { ...item, fromKey, toKey, gates: (item.gates ?? []).map(cloneGate) };
    const id = edgeId(remapped);
    if (!storedEdges.has(id)) storedEdges.set(id, remapped);
  }

  const transitions = defaults.transitions.map((def) => {
    const stored = storedEdges.get(edgeId(def));
    if (!stored) return { ...def, gates: def.gates.map(cloneGate) };
    return {
      ...def,
      enabled: stored.enabled,
      enforcement: stored.enforcement,
      gates: mergeGates(def.gates, stored.gates),
    };
  });

  return { statuses, transitions };
}
