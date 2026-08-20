/**
 * Rebuild a stored alert graph to the sheet’s 7 statuses.
 * Strict: Pending → Active, Actioned → Resolved, Dismissed/Expired → Closed.
 * Extra statuses and edges are dropped — not added on top of the old 5.
 */
import {
  createDefaultAlertLifecycleConfig,
  type AlertLifecycleConfig,
  type AlertLifecycleStatusConfig,
  type AlertLifecycleTransitionConfig,
  type AlertTypeConfig,
} from "@/lib/alert-lifecycle-config";

function edgeId(
  item: Pick<AlertLifecycleTransitionConfig, "fromKey" | "toKey">
): string {
  return `${item.fromKey}:${item.toKey}`;
}

function remapStatusKey(key: string): string {
  if (key === "pending") return "active";
  if (key === "actioned") return "resolved";
  if (key === "dismissed" || key === "expired") return "closed";
  return key;
}

function overlayStatus(
  def: AlertLifecycleStatusConfig,
  stored: AlertLifecycleStatusConfig | undefined
): AlertLifecycleStatusConfig {
  if (!stored) return { ...def };
  const storedLabel = stored.label.trim();
  const lower = storedLabel.toLocaleLowerCase();
  const label =
    (def.key === "active" && lower === "pending") ||
    (def.key === "resolved" && lower === "actioned") ||
    (def.key === "closed" && (lower === "dismissed" || lower === "expired"))
      ? def.label
      : storedLabel || def.label;
  return {
    ...def,
    label,
    enabled: stored.enabled !== false,
  };
}

/**
 * Reconcile a stored alert config to the shipped 7-status spec.
 * @param config - Current user graph (already field-normalized).
 * @returns Sheet graph: 7 statuses, sheet edges, stored types kept when present.
 */
export function reconcileAlertLifecycleSpec(
  config: AlertLifecycleConfig
): AlertLifecycleConfig {
  const defaults = createDefaultAlertLifecycleConfig();
  const storedByKey = new Map<string, AlertLifecycleStatusConfig>();
  for (const item of config.statuses) {
    const key = remapStatusKey(item.key);
    if (!storedByKey.has(key)) storedByKey.set(key, { ...item, key });
  }

  const statuses = defaults.statuses.map((def) =>
    overlayStatus(def, storedByKey.get(def.key))
  );

  const storedEdges = new Map<string, AlertLifecycleTransitionConfig>();
  for (const item of config.transitions) {
    const fromKey = remapStatusKey(item.fromKey);
    const toKey = remapStatusKey(item.toKey);
    if (fromKey === toKey) continue;
    const remapped = { ...item, fromKey, toKey };
    const id = edgeId(remapped);
    if (!storedEdges.has(id)) storedEdges.set(id, remapped);
  }

  const transitions = defaults.transitions.map((def) => {
    const stored = storedEdges.get(edgeId(def));
    if (!stored) return { ...def };
    return {
      ...def,
      enabled: stored.enabled,
      enforcement: stored.enforcement,
    };
  });

  const types: AlertTypeConfig[] =
    config.types.length > 0
      ? config.types.map((t) => ({ ...t }))
      : defaults.types.map((t) => ({ ...t }));

  return { statuses, transitions, types };
}
