"use client";

/**
 * Transitions panel — list edges grouped by from-status; toggle enable + enforcement.
 */
import { Plus } from "lucide-react";
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  groupTransitionsByFrom,
  releaseLifecycleTargetKey,
  transitionTargetLabel,
} from "@/lib/release-lifecycle-settings-ui";
import { taBtnPrimary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

export type TransitionsPanelProps = {
  config: ReleaseLifecycleConfig;
  editing: boolean;
  selectedKey: string | null;
  onSelect: (fromKey: string, targetKey: string) => void;
  onToggleEnabled: (fromKey: string, targetKey: string, enabled: boolean) => void;
  onToggleEnforcement: (fromKey: string, targetKey: string, required: boolean) => void;
  addFrom: string;
  addTo: string;
  onAddFromChange: (value: string) => void;
  onAddToChange: (value: string) => void;
  onAdd: () => void;
  enforcementWarning: string | null;
};

/**
 * Render transition graph as grouped lists with enable/Required controls.
 */
export function TransitionsPanel({
  config,
  editing,
  selectedKey,
  onSelect,
  onToggleEnabled,
  onToggleEnforcement,
  addFrom,
  addTo,
  onAddFromChange,
  onAddToChange,
  onAdd,
  enforcementWarning,
}: TransitionsPanelProps) {
  const groups = groupTransitionsByFrom(config);
  const statusOptions = [...config.statuses].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-4" data-testid="lifecycle-transitions-panel">
      {enforcementWarning ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          data-testid="lifecycle-enforcement-warning"
          role="status"
        >
          {enforcementWarning}
        </div>
      ) : null}

      <div className="space-y-3">
        {groups.map(({ from, transitions }) => (
          <div
            key={from.key}
            className="rounded-xl border border-slate-200 dark:border-[var(--border)]"
          >
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/50">
              From {from.label}
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-white/10">
              {transitions.map((transition) => {
                const targetKey = releaseLifecycleTargetKey(transition);
                const rowKey = `${transition.fromKey}:${targetKey}`;
                const selected = selectedKey === rowKey;
                const enabledGateCount = transition.gates.filter((g) => g.enabled).length;
                return (
                  <li key={rowKey}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors",
                        selected
                          ? "bg-brand-500/8 dark:bg-brand-500/15"
                          : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                      )}
                      onClick={() => onSelect(transition.fromKey, targetKey)}
                      data-testid={`lifecycle-transition-row-${rowKey}`}
                    >
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
                          → {transitionTargetLabel(transition, config.statuses)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-white/40">
                          {enabledGateCount} gate{enabledGateCount === 1 ? "" : "s"} · click to
                          manage gates
                        </p>
                      </div>
                      <div
                        className="flex flex-wrap items-center gap-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-white/70">
                          <input
                            type="checkbox"
                            checked={transition.enabled}
                            disabled={!editing}
                            onChange={(e) =>
                              onToggleEnabled(transition.fromKey, targetKey, e.target.checked)
                            }
                            data-testid={`lifecycle-transition-enabled-${rowKey}`}
                          />
                          On
                        </label>
                        <label className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-white/70">
                          <input
                            type="checkbox"
                            checked={transition.enforcement === "required"}
                            disabled={!editing}
                            onChange={(e) =>
                              onToggleEnforcement(
                                transition.fromKey,
                                targetKey,
                                e.target.checked
                              )
                            }
                            data-testid={`lifecycle-transition-required-${rowKey}`}
                          />
                          Required
                        </label>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {editing ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 dark:border-[var(--border)] dark:bg-white/[0.03]">
          <p className="mb-3 text-[13px] font-semibold text-slate-700 dark:text-white/80">
            Add transition
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-[12px] font-medium text-slate-600 dark:text-white/65">
              From
              <select
                className={cn(taInput, "mt-1")}
                value={addFrom}
                onChange={(e) => onAddFromChange(e.target.value)}
                data-testid="lifecycle-transition-add-from"
              >
                <option value="">Select…</option>
                {statusOptions
                  .filter((s) => !s.terminal)
                  .map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="min-w-0 flex-1 text-[12px] font-medium text-slate-600 dark:text-white/65">
              To
              <select
                className={cn(taInput, "mt-1")}
                value={addTo}
                onChange={(e) => onAddToChange(e.target.value)}
                data-testid="lifecycle-transition-add-to"
              >
                <option value="">Select…</option>
                {statusOptions.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={cn(taBtnPrimary, "gap-1.5")}
              onClick={onAdd}
              data-testid="lifecycle-transition-add"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
