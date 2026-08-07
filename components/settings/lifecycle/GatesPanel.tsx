"use client";

/**
 * Gates panel — attach/toggle fixed-catalog gates for a selected transition.
 * Free-form gates are never offered.
 */
import {
  RELEASE_LIFECYCLE_GATE_CATALOG,
  RELEASE_LIFECYCLE_GATE_TYPES,
  type ReleaseLifecycleGateType,
} from "@/lib/release-lifecycle-gates";
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  isAlwaysPassLifecycleGate,
  releaseLifecycleTargetKey,
  transitionTargetLabel,
} from "@/lib/release-lifecycle-settings-ui";
import { cn } from "@/lib/utils";

export type GatesPanelProps = {
  config: ReleaseLifecycleConfig;
  editing: boolean;
  selectedFromKey: string | null;
  selectedTargetKey: string | null;
  onToggleGate: (
    fromKey: string,
    targetKey: string,
    gateType: ReleaseLifecycleGateType,
    enabled: boolean
  ) => void;
};

/**
 * Show catalog gates for the selected transition with reliability badges.
 */
export function GatesPanel({
  config,
  editing,
  selectedFromKey,
  selectedTargetKey,
  onToggleGate,
}: GatesPanelProps) {
  if (!selectedFromKey || !selectedTargetKey) {
    return (
      <div
        className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-[13px] text-slate-500 dark:border-[var(--border)] dark:text-white/45"
        data-testid="lifecycle-gates-empty"
      >
        Select a transition in the Transitions panel to manage its gates.
      </div>
    );
  }

  const transition = config.transitions.find(
    (item) =>
      item.fromKey === selectedFromKey &&
      releaseLifecycleTargetKey(item) === selectedTargetKey
  );
  if (!transition) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
        Selected transition is no longer in the draft graph.
      </div>
    );
  }

  const fromLabel =
    config.statuses.find((s) => s.key === transition.fromKey)?.label ?? transition.fromKey;
  const toLabel = transitionTargetLabel(transition, config.statuses);
  const enabledByType = new Map(
    transition.gates.map((gate) => [gate.gateType, gate.enabled] as const)
  );

  return (
    <div className="space-y-3" data-testid="lifecycle-gates-panel">
      <p className="text-[13px] text-slate-600 dark:text-white/65">
        Gates for{" "}
        <span className="font-semibold text-slate-900 dark:text-white">
          {fromLabel} → {toLabel}
        </span>
        . Only the fixed catalog is available — custom executable gates cannot be added.
      </p>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-[var(--border)]">
        {RELEASE_LIFECYCLE_GATE_TYPES.map((gateType) => {
          const meta = RELEASE_LIFECYCLE_GATE_CATALOG[gateType];
          const enabled = enabledByType.get(gateType) ?? false;
          const alwaysPass = isAlwaysPassLifecycleGate(gateType);
          return (
            <li
              key={gateType}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
              data-testid={`lifecycle-gate-row-${gateType}`}
            >
              <div className="min-w-0 max-w-xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-slate-900 dark:text-white">
                    {meta.label}
                  </span>
                  {alwaysPass ? (
                    <span
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-100"
                      data-testid={`lifecycle-gate-always-pass-${gateType}`}
                    >
                      Not yet enforced — always passes
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[12px] leading-snug text-slate-500 dark:text-white/50">
                  {meta.description}
                  {meta.futureFollowUp ? ` ${meta.futureFollowUp}` : ""}
                </p>
              </div>
              <label
                className={cn(
                  "flex items-center gap-2 text-[13px] font-medium text-slate-700 dark:text-white/80",
                  !editing && "opacity-70"
                )}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={!editing}
                  onChange={(e) =>
                    onToggleGate(
                      selectedFromKey,
                      selectedTargetKey,
                      gateType,
                      e.target.checked
                    )
                  }
                  data-testid={`lifecycle-gate-toggle-${gateType}`}
                />
                Attached
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
