"use client";

/**
 * Shared Transitions tab: search + group by starting status.
 * Used by every entity Lifecycle Settings page except Release (which has extra Checks).
 */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { LifecycleToggle } from "@/components/settings/lifecycle/LifecycleToggle";
import {
  groupTransitionsByFrom,
  type LifecycleTransitionRowRef,
  type LifecycleTransitionStatusRef,
} from "@/lib/lifecycle-transitions-ui";
import { taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

export type EntityTransitionItem = Omit<LifecycleTransitionRowRef, "toKey"> & {
  toKey: string;
  enabled: boolean;
  enforcement: "required" | "flexible";
};

export type EntityTransitionsListProps = {
  statuses: readonly LifecycleTransitionStatusRef[];
  transitions: readonly EntityTransitionItem[];
  editing: boolean;
  onToggleEnabled: (fromKey: string, toKey: string, enabled: boolean) => void;
  onToggleEnforcement: (fromKey: string, toKey: string, required: boolean) => void;
  /** When true, show a locked “Always required” chip instead of the Flexible toggle. */
  enforcementLocked?: (fromKey: string, toKey: string) => boolean;
};

/**
 * Searchable, grouped list of allowed status moves.
 */
export function EntityTransitionsList({
  statuses,
  transitions,
  editing,
  onToggleEnabled,
  onToggleEnforcement,
  enforcementLocked,
}: EntityTransitionsListProps) {
  const [query, setQuery] = useState("");
  const groups = useMemo(
    () => groupTransitionsByFrom(transitions, statuses, query),
    [query, statuses, transitions]
  );
  const matchCount = groups.reduce((sum, group) => sum + group.transitions.length, 0);

  return (
    <div className="space-y-3" data-testid="lifecycle-entity-transitions">
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
            placeholder="Search moves — e.g. Open, Closed, Escalated…"
            className={cn(taInput, "h-9 pl-9")}
            data-testid="lifecycle-transitions-search"
          />
        </span>
      </label>
      <p className="text-[12px] leading-relaxed text-slate-500 dark:text-white/55">
        Grouped by starting status. <strong className="font-semibold text-slate-600 dark:text-white/70">On</strong>{" "}
        means this move is a next step.{" "}
        <strong className="font-semibold text-slate-600 dark:text-white/70">Flexible</strong> lets
        you continue with a reason if a check fails;{" "}
        <strong className="font-semibold text-slate-600 dark:text-white/70">Required</strong>{" "}
        blocks the move until checks pass.
      </p>

      {matchCount === 0 ? (
        <p className="rounded-xl border border-slate-200 px-4 py-8 text-center text-[13px] text-slate-500 dark:border-[var(--border)] dark:text-white/45">
          {query.trim()
            ? `No moves match “${query.trim()}”.`
            : "No transitions are configured."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-[var(--border)]">
          {groups.map((group) => (
            <div
              key={group.fromKey}
              className="border-b border-slate-100 last:border-b-0 dark:border-white/10"
            >
              <div className="flex items-center justify-between bg-slate-50 px-4 py-2 dark:bg-white/[0.04]">
                <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500 dark:text-white/55">
                  From {group.fromLabel}
                </p>
                <p className="text-[11px] font-medium text-slate-400 dark:text-white/40">
                  {group.transitions.length} move
                  {group.transitions.length === 1 ? "" : "s"}
                </p>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-white/10">
                {group.transitions.map((transition) => {
                  const toLabel =
                    statuses.find((s) => s.key === transition.toKey)?.label ??
                    transition.toKey;
                  const locked = enforcementLocked?.(
                    transition.fromKey,
                    transition.toKey
                  );
                  const rowKey = `${transition.fromKey}:${transition.toKey}`;
                  return (
                    <li
                      key={rowKey}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                      data-testid={`lifecycle-transition-row-${rowKey}`}
                    >
                      <p className="min-w-0 text-[14px] font-semibold text-slate-900 dark:text-white">
                        <span className="text-slate-400 dark:text-white/40">→</span> {toLabel}
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <LifecycleToggle
                          checked={transition.enabled}
                          disabled={!editing}
                          label={transition.enabled ? "On" : "Off"}
                          onCheckedChange={(enabled) =>
                            onToggleEnabled(
                              transition.fromKey,
                              transition.toKey,
                              enabled
                            )
                          }
                          title="When On, this move appears as a next step."
                          aria-label={`${group.fromLabel} to ${toLabel} ${transition.enabled ? "On" : "Off"}`}
                        />
                        {locked ? (
                          <span
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-white/70"
                            title="Checks on this move must pass. A reason cannot skip them."
                          >
                            Always required
                          </span>
                        ) : (
                          <LifecycleToggle
                            checked={transition.enforcement === "required"}
                            disabled={!editing}
                            label={
                              transition.enforcement === "required"
                                ? "Required"
                                : "Flexible"
                            }
                            onCheckedChange={(required) =>
                              onToggleEnforcement(
                                transition.fromKey,
                                transition.toKey,
                                required
                              )
                            }
                            title="Required = checks must pass. Flexible = continue with a reason."
                            aria-label={`${group.fromLabel} to ${toLabel} enforcement`}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
