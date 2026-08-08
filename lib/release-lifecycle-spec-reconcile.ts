/**
 * Merge enterprise-spec defaults into an existing per-user lifecycle graph.
 * Additive: adds missing edges/gates and upgrades CFG-06 Required enforcement.
 * Does not delete user customizations or re-enable disabled edges.
 */
import {
  createDefaultReleaseLifecycleConfig,
  releaseLifecycleTargetKey,
  type ReleaseLifecycleConfig,
  type ReleaseLifecycleTransitionConfig,
} from "@/lib/release-lifecycle-config";
import { cloneLifecycleConfig } from "@/lib/release-lifecycle-settings-ui";

function edgeKey(item: Pick<ReleaseLifecycleTransitionConfig, "fromKey" | "toKey" | "isPreviousStatus">): string {
  return `${item.fromKey}:${releaseLifecycleTargetKey(item)}`;
}

/**
 * Reconcile a stored config toward the shipped enterprise spec.
 *
 * @param config - Current user (or pinned) lifecycle config.
 * @returns Cloned config with missing spec edges/gates and CFG-06 Required applied.
 */
export function reconcileLifecycleSpecDefaults(
  config: ReleaseLifecycleConfig
): ReleaseLifecycleConfig {
  const defaults = createDefaultReleaseLifecycleConfig();
  const next = cloneLifecycleConfig(config);
  const byKey = new Map(
    next.transitions.map((item) => [edgeKey(item), item] as const)
  );

  for (const def of defaults.transitions) {
    const key = edgeKey(def);
    const existing = byKey.get(key);
    if (!existing) {
      const added: ReleaseLifecycleTransitionConfig = {
        ...def,
        gates: def.gates.map((gate) => ({
          ...gate,
          params: gate.params ? { ...gate.params } : undefined,
        })),
      };
      next.transitions.push(added);
      byKey.set(key, added);
      continue;
    }

    // CFG-06: Deploying / Deployed exits must be Required.
    if (
      (def.fromKey === "deploying" || def.fromKey === "deployed") &&
      def.enforcement === "required"
    ) {
      existing.enforcement = "required";
    }

    for (const gate of def.gates) {
      if (!existing.gates.some((item) => item.gateType === gate.gateType)) {
        existing.gates.push({
          ...gate,
          params: gate.params ? { ...gate.params } : undefined,
        });
      }
    }
  }

  return next;
}
