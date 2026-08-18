"use client";

/**
 * Transitions panel — Active / Inactive moves; toggle enable + enforcement.
 */
import { useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { groupTransitionsByFrom } from "@/lib/lifecycle-transitions-ui";
import type {
  ReleaseLifecycleConfig,
  ReleaseLifecycleTransitionConfig,
} from "@/lib/release-lifecycle-config";
import {
  isCfg06EnforcementLocked,
  releaseLifecycleTargetKey,
  transitionRemovalBlockReason,
  transitionTargetLabel,
} from "@/lib/release-lifecycle-settings-ui";
import { LifecycleSection } from "@/components/settings/lifecycle/LifecycleSection";
import { LifecycleToggle } from "@/components/settings/lifecycle/LifecycleToggle";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

export type TransitionsPanelProps = {
  config: ReleaseLifecycleConfig;
  editing: boolean;
  selectedKey: string | null;
  onSelect: (fromKey: string, targetKey: string) => void;
  onToggleEnabled: (fromKey: string, targetKey: string, enabled: boolean) => void;
  onToggleEnforcement: (fromKey: string, targetKey: string, required: boolean) => void;
  onRemove: (fromKey: string, targetKey: string) => void;
  addFrom: string;
  addTo: string;
  onAddFromChange: (value: string) => void;
  onAddToChange: (value: string) => void;
  onAdd: () => void;
  enforcementWarning: string | null;
};

/** Extra line when an inactive move is blocked because a status is Off. */
function inactiveEndpointHint(
  transition: ReleaseLifecycleTransitionConfig,
  config: ReleaseLifecycleConfig
): string {
  if (transition.enabled) return "";
  const from = config.statuses.find((status) => status.key === transition.fromKey);
  const to = transition.toKey
    ? config.statuses.find((status) => status.key === transition.toKey)
    : undefined;
  const off = [from, to]
    .filter((status): status is NonNullable<typeof status> => Boolean(status && !status.enabled))
    .map((status) => status.label);
  if (off.length === 0) return "";
  const names = [...new Set(off)].join(" and ");
  return ` · ${names} is Off — turning this move On will turn that status back on`;
}

/**
 * Render Active and Inactive transition lists with enable/Required controls.
 */
export function TransitionsPanel({
  config,
  editing,
  selectedKey,
  onSelect,
  onToggleEnabled,
  onToggleEnforcement,
  onRemove,
  addFrom,
  addTo,
  onAddFromChange,
  onAddToChange,
  onAdd,
  enforcementWarning,
}: TransitionsPanelProps) {
  const [query, setQuery] = useState("");
  const statusOptions = [...config.statuses].sort((a, b) => a.sortOrder - b.sortOrder);
  const active = useMemo(
    () => config.transitions.filter((t) => t.enabled),
    [config.transitions]
  );
  const inactive = useMemo(
    () => config.transitions.filter((t) => !t.enabled),
    [config.transitions]
  );
  const activeGroups = useMemo(
    () => groupTransitionsByFrom(active, config.statuses, query),
    [active, config.statuses, query]
  );
  const inactiveGroups = useMemo(
    () => groupTransitionsByFrom(inactive, config.statuses, query),
    [inactive, config.statuses, query]
  );

  const renderGroups = (
    groups: ReturnType<typeof groupTransitionsByFrom<ReleaseLifecycleTransitionConfig>>
  ) => (
    <div className="divide-y divide-slate-100 dark:divide-white/10">
      {groups.map(({ fromKey, fromLabel, transitions }) => (
        <div key={fromKey}>
          <div className="bg-slate-50/50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:bg-white/[0.02] dark:text-white/40">
            From {fromLabel}
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-white/10">
            {transitions.map((transition) => {
              const targetKey = releaseLifecycleTargetKey(transition);
              const rowKey = `${transition.fromKey}:${targetKey}`;
              const selected = selectedKey === rowKey;
              const enabledGateCount = transition.gates.filter((g) => g.enabled).length;
              const removeBlock = transitionRemovalBlockReason(transition);
              return (
                <li key={rowKey}>
                  <div
                    className={cn(
                      "flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors",
                      selected
                        ? "bg-brand-500/8 dark:bg-brand-500/15"
                        : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    )}
                    data-testid={`lifecycle-transition-row-${rowKey}`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                      onClick={() => onSelect(transition.fromKey, targetKey)}
                    >
                      <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
                        → {transitionTargetLabel(transition, config.statuses)}
                        {!transition.isSystem ? (
                          <span className="ml-2 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                            Custom
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-white/40">
                        {enabledGateCount} check{enabledGateCount === 1 ? "" : "s"} · click to
                        open Checks for this move
                        {inactiveEndpointHint(transition, config)}
                      </p>
                    </button>
                    <div className="flex flex-wrap items-center gap-3">
                      <LifecycleToggle
                        checked={transition.enabled}
                        onCheckedChange={(enabled) =>
                          onToggleEnabled(transition.fromKey, targetKey, enabled)
                        }
                        label={transition.enabled ? "On" : "Off"}
                        disabled={!editing}
                        title="When On, this move appears as a next step. Off hides it without deleting."
                        aria-label={`Transition ${transitionTargetLabel(transition, config.statuses)} ${transition.enabled ? "On" : "Off"}`}
                        data-testid={`lifecycle-transition-enabled-${rowKey}`}
                      />
                      {isCfg06EnforcementLocked(transition.fromKey) ? (
                        <span
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-white/70"
                          title="Checks on this move must pass. A reason cannot skip them."
                          data-testid={`lifecycle-transition-required-${rowKey}`}
                        >
                          Always required
                        </span>
                      ) : (
                        <LifecycleToggle
                          checked={transition.enforcement === "required"}
                          onCheckedChange={(required) =>
                            onToggleEnforcement(transition.fromKey, targetKey, required)
                          }
                          label={
                            transition.enforcement === "required" ? "Required" : "Flexible"
                          }
                          disabled={!editing}
                          title="Required = checks must pass (must fix first — no exception). Flexible = continue with a reason when checks fail."
                          aria-label={`Transition ${transitionTargetLabel(transition, config.statuses)} enforcement`}
                          data-testid={`lifecycle-transition-required-${rowKey}`}
                        />
                      )}
                      {editing ? (
                        <button
                          type="button"
                          className={cn(
                            taBtnSecondary,
                            "gap-1 px-2.5 py-1.5 text-[12px] text-rose-700 disabled:opacity-40 dark:text-rose-300"
                          )}
                          disabled={Boolean(removeBlock)}
                          title={removeBlock ?? "Remove this transition"}
                          onClick={() => onRemove(transition.fromKey, targetKey)}
                          data-testid={`lifecycle-transition-remove-${rowKey}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );

  const activeMatchCount = activeGroups.reduce(
    (sum, group) => sum + group.transitions.length,
    0
  );
  const inactiveMatchCount = inactiveGroups.reduce(
    (sum, group) => sum + group.transitions.length,
    0
  );

  return (
    <div className="space-y-4" data-testid="lifecycle-transitions-panel">
      <label className="block">
        <span className="sr-only">Search transitions</span>
        <span className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search moves — e.g. Draft, Ready, Closed…"
            className={cn(taInput, "h-9 pl-9")}
            data-testid="lifecycle-transitions-search"
          />
        </span>
      </label>
      <p className="text-[12px] leading-relaxed text-slate-500 dark:text-white/55">
        Grouped by starting status. Search by the from or to name.
      </p>
      {enforcementWarning ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          data-testid="lifecycle-enforcement-warning"
          role="status"
        >
          {enforcementWarning}
        </div>
      ) : null}

      <LifecycleSection
        title="Active"
        count={activeMatchCount}
        emptyMessage={
          query.trim()
            ? `No active moves match “${query.trim()}”.`
            : "No active transitions — turn a move On below."
        }
        testId="lifecycle-transitions-active"
      >
        {activeMatchCount > 0 ? renderGroups(activeGroups) : null}
      </LifecycleSection>

      <LifecycleSection
        title="Inactive"
        count={inactiveMatchCount}
        emptyMessage={
          query.trim()
            ? `No inactive moves match “${query.trim()}”.`
            : "No inactive transitions."
        }
        testId="lifecycle-transitions-inactive"
      >
        {inactiveMatchCount > 0 ? renderGroups(inactiveGroups) : null}
      </LifecycleSection>

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
