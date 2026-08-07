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
import { LifecycleToggle } from "@/components/settings/lifecycle/LifecycleToggle";
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

type GateRow = {
  gateType: ReleaseLifecycleGateType;
  attached: boolean;
};

/**
 * Show catalog gates for the selected transition with reliability badges.
 * Attached rules are listed first so “1 gate” matches what the user expects to see.
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

  const rows: GateRow[] = RELEASE_LIFECYCLE_GATE_TYPES.map((gateType) => ({
    gateType,
    attached: enabledByType.get(gateType) ?? false,
  }));
  const attached = rows.filter((row) => row.attached);
  const available = rows.filter((row) => !row.attached);
  const enforcementLabel =
    transition.enforcement === "required" ? "Required (hard block)" : "Flexible (override allowed)";

  const renderRow = (row: GateRow) => {
    const meta = RELEASE_LIFECYCLE_GATE_CATALOG[row.gateType];
    const alwaysPass = isAlwaysPassLifecycleGate(row.gateType);
    return (
      <li
        key={row.gateType}
        className={cn(
          "flex flex-wrap items-start justify-between gap-3 px-4 py-3",
          row.attached && "bg-brand-500/5 dark:bg-brand-500/10"
        )}
        data-testid={`lifecycle-gate-row-${row.gateType}`}
      >
        <div className="min-w-0 max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-slate-900 dark:text-white">
              {meta.label}
            </span>
            {row.attached ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                Active on this move
              </span>
            ) : null}
            {alwaysPass ? (
              <span
                className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-100"
                data-testid={`lifecycle-gate-always-pass-${row.gateType}`}
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
        <LifecycleToggle
          checked={row.attached}
          onCheckedChange={(enabled) =>
            onToggleGate(selectedFromKey, selectedTargetKey, row.gateType, enabled)
          }
          label={row.attached ? "Attached" : "Off"}
          disabled={!editing}
          title={
            row.attached
              ? "Detach — this check will no longer run for this move"
              : "Attach — this check will run when someone takes this move"
          }
          aria-label={`${meta.label} ${row.attached ? "Attached" : "Off"}`}
          data-testid={`lifecycle-gate-toggle-${row.gateType}`}
        />
      </li>
    );
  };

  return (
    <div className="space-y-4" data-testid="lifecycle-gates-panel">
      <div className="space-y-1.5 text-[13px] text-slate-600 dark:text-white/65">
        <p>
          Gates for{" "}
          <span className="font-semibold text-slate-900 dark:text-white">
            {fromLabel} → {toLabel}
          </span>
          .
        </p>
        <p>
          <span className="font-semibold text-slate-800 dark:text-white/85">
            {attached.length} active
          </span>{" "}
          on this move · enforcement is{" "}
          <span className="font-semibold text-slate-800 dark:text-white/85">
            {enforcementLabel}
          </span>
          . The list below is the full menu of checks — turn{" "}
          <span className="font-semibold">Attached</span> on for the ones that apply.
        </p>
      </div>

      <section className="space-y-2">
        <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-500 dark:text-white/50">
          Active on this move ({attached.length})
        </h4>
        {attached.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-4 text-[13px] text-slate-500 dark:border-[var(--border)] dark:text-white/45">
            No checks attached yet — anyone can take this move (when the transition is On).
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-[var(--border)]">
            {attached.map(renderRow)}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-500 dark:text-white/50">
          Available checks — attach more ({available.length})
        </h4>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-[var(--border)]">
          {available.map(renderRow)}
        </ul>
      </section>
    </div>
  );
}
