/**
 * Merge enterprise-spec defaults into an existing per-user lifecycle graph.
 * Additive for missing edges/gates; upgrades CFG-06 Required enforcement;
 * Wave A retargets known Progression Blocker gates from one-stage-late edges
 * onto the sheet’s intended transitions. Does not force user Off toggles back On.
 */
import {
  createDefaultReleaseLifecycleConfig,
  releaseLifecycleTargetKey,
  type ReleaseLifecycleConfig,
  type ReleaseLifecycleGateAttachment,
  type ReleaseLifecycleTransitionConfig,
} from "@/lib/release-lifecycle-config";
import type { ReleaseLifecycleGateType } from "@/lib/release-lifecycle-gates";
import { cloneLifecycleConfig } from "@/lib/release-lifecycle-settings-ui";

function edgeKey(
  item: Pick<
    ReleaseLifecycleTransitionConfig,
    "fromKey" | "toKey" | "isPreviousStatus"
  >
): string {
  return `${item.fromKey}:${releaseLifecycleTargetKey(item)}`;
}

/**
 * Wave A — gates that were seeded one stage later than the Release Fields
 * Progression Blockers sheet. Reconcile moves them off the obsolete edge and
 * ensures they exist on the correct edge (defaults already have the new shape).
 *
 * Format: gateType must leave `fromEdge` and be present on `toEdge`.
 */
const WAVE_A_GATE_RETARGETS: readonly {
  gateType: ReleaseLifecycleGateType;
  fromEdge: { fromKey: string; toKey: string };
  toEdge: { fromKey: string; toKey: string };
}[] = [
  {
    gateType: "no_open_blockers",
    fromEdge: { fromKey: "ready_to_deploy", toKey: "deploying" },
    toEdge: { fromKey: "cab_approved", toKey: "ready_to_deploy" },
  },
  {
    gateType: "rollback_plan_documented",
    fromEdge: { fromKey: "ready_to_deploy", toKey: "deploying" },
    toEdge: { fromKey: "cab_approved", toKey: "ready_to_deploy" },
  },
  {
    gateType: "pre_deployment_checklist_complete",
    fromEdge: { fromKey: "ready_to_deploy", toKey: "deploying" },
    toEdge: { fromKey: "cab_approved", toKey: "ready_to_deploy" },
  },
  {
    gateType: "environment_booked_for_deploy",
    fromEdge: { fromKey: "deploying", toKey: "deployed" },
    toEdge: { fromKey: "ready_to_deploy", toKey: "deploying" },
  },
  {
    gateType: "hard_dependencies_met",
    fromEdge: { fromKey: "deploying", toKey: "deployed" },
    toEdge: { fromKey: "ready_to_deploy", toKey: "deploying" },
  },
];

function findEdge(
  byKey: Map<string, ReleaseLifecycleTransitionConfig>,
  fromKey: string,
  toKey: string
): ReleaseLifecycleTransitionConfig | undefined {
  return byKey.get(`${fromKey}:${toKey}`);
}

/**
 * Apply Wave A attachment moves: strip obsolete placements, ensure target edge
 * has the gate (using default sortOrder/enforcement when inserting).
 */
function applyWaveAGateRetargets(
  byKey: Map<string, ReleaseLifecycleTransitionConfig>,
  defaults: ReleaseLifecycleConfig
): void {
  const defaultByKey = new Map(
    defaults.transitions.map((item) => [edgeKey(item), item] as const)
  );

  for (const move of WAVE_A_GATE_RETARGETS) {
    const obsolete = findEdge(
      byKey,
      move.fromEdge.fromKey,
      move.fromEdge.toKey
    );
    if (obsolete) {
      obsolete.gates = obsolete.gates.filter((g) => g.gateType !== move.gateType);
    }

    const target = findEdge(byKey, move.toEdge.fromKey, move.toEdge.toKey);
    if (!target) continue;
    if (target.gates.some((g) => g.gateType === move.gateType)) continue;

    const defEdge = findEdge(
      defaultByKey,
      move.toEdge.fromKey,
      move.toEdge.toKey
    );
    const defGate = defEdge?.gates.find((g) => g.gateType === move.gateType);
    const attachment: ReleaseLifecycleGateAttachment = defGate
      ? {
          ...defGate,
          params: defGate.params ? { ...defGate.params } : undefined,
        }
      : {
          gateType: move.gateType,
          enabled: true,
          enforcement: "inherit",
          sortOrder: (target.gates.length + 1) * 10,
        };
    target.gates.push(attachment);
  }

  // VR-16 also requires hard_dependencies_met on Ready entry (in addition to
  // Deploying entry). Retarget above only moves the Deploying→Deployed copy.
  const cabToReady = findEdge(byKey, "cab_approved", "ready_to_deploy");
  if (
    cabToReady &&
    !cabToReady.gates.some((g) => g.gateType === "hard_dependencies_met")
  ) {
    const defEdge = findEdge(defaultByKey, "cab_approved", "ready_to_deploy");
    const defGate = defEdge?.gates.find(
      (g) => g.gateType === "hard_dependencies_met"
    );
    cabToReady.gates.push(
      defGate
        ? {
            ...defGate,
            params: defGate.params ? { ...defGate.params } : undefined,
          }
        : {
            gateType: "hard_dependencies_met",
            enabled: true,
            enforcement: "inherit",
            sortOrder: 50,
          }
    );
  }
}

/**
 * Reconcile a stored config toward the shipped enterprise spec.
 *
 * @param config - Current user (or pinned) lifecycle config.
 * @returns Cloned config with missing spec edges/gates, CFG-06 Required, and Wave A retargets.
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
      // Re-add missing shipped edges for gates/CFG-06 — but never revive a move
      // the user turned Off (enabled is preserved from `config` / never forced On).
      const added: ReleaseLifecycleTransitionConfig = {
        ...def,
        // If the edge was absent from head tables, keep default On. Callers that
        // already have the row (enabled: false) hit the branch below instead.
        enabled: def.enabled,
        gates: def.gates.map((gate) => ({
          ...gate,
          params: gate.params ? { ...gate.params } : undefined,
        })),
      };
      next.transitions.push(added);
      byKey.set(key, added);
      continue;
    }

    // Never flip a stored Off back to On — user toggles must survive reload.
    // (Older builds forced shipped edges On here; that made Cancelled return.)

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

  applyWaveAGateRetargets(byKey, defaults);
  // Repair shipped stages wrongly saved as terminal (e.g. Planning). Do not
  // force transition.enabled — an Off toggle must survive reload/save.
  repairShippedStatusKinds(next, defaults);

  return next;
}

/**
 * Restore kind/terminal for non-final shipped statuses if they were corrupted.
 * Leaves enabled alone so Statuses Off stays Off.
 */
function repairShippedStatusKinds(
  next: ReleaseLifecycleConfig,
  defaults: ReleaseLifecycleConfig
): void {
  const shippedStatus = new Map(defaults.statuses.map((item) => [item.key, item]));
  for (const status of next.statuses) {
    const shipped = shippedStatus.get(status.key);
    if (!shipped || shipped.terminal) continue;
    if (status.terminal || status.kind === "terminal") {
      status.terminal = false;
      status.kind = shipped.kind;
    }
  }
}
