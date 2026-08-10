"use client";

/**
 * Gates panel — Active / Inactive transitions; expand a row to manage checks.
 * Attached checks live under Active only; Available never re-lists them.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  RELEASE_LIFECYCLE_GATE_CATALOG,
  type ReleaseLifecycleGateType,
} from "@/lib/release-lifecycle-gates";
import type {
  ReleaseLifecycleConfig,
  ReleaseLifecycleTransitionConfig,
} from "@/lib/release-lifecycle-config";
import {
  isAlwaysPassLifecycleGate,
  partitionTransitionGateCatalog,
  releaseLifecycleTargetKey,
  transitionTargetLabel,
} from "@/lib/release-lifecycle-settings-ui";
import { LifecycleSection } from "@/components/settings/lifecycle/LifecycleSection";
import { LifecycleToggle } from "@/components/settings/lifecycle/LifecycleToggle";
import { cn } from "@/lib/utils";

export type GatesPanelProps = {
  config: ReleaseLifecycleConfig;
  editing: boolean;
  /** Optional: expand this transition (e.g. after clicking a row on Transitions). */
  selectedFromKey: string | null;
  selectedTargetKey: string | null;
  onToggleGate: (
    fromKey: string,
    targetKey: string,
    gateType: ReleaseLifecycleGateType,
    enabled: boolean
  ) => void;
};

function transitionRowKey(transition: ReleaseLifecycleTransitionConfig): string {
  return `${transition.fromKey}:${releaseLifecycleTargetKey(transition)}`;
}

function sortTransitions(
  transitions: ReleaseLifecycleTransitionConfig[],
  statusOrder: Map<string, number>
): ReleaseLifecycleTransitionConfig[] {
  return [...transitions].sort((a, b) => {
    const fromDiff =
      (statusOrder.get(a.fromKey) ?? 0) - (statusOrder.get(b.fromKey) ?? 0);
    if (fromDiff !== 0) return fromDiff;
    return a.sortOrder - b.sortOrder;
  });
}

/**
 * Show Active and Inactive transitions; expand one to attach/detach catalog gates.
 */
export function GatesPanel({
  config,
  editing,
  selectedFromKey,
  selectedTargetKey,
  onToggleGate,
}: GatesPanelProps) {
  const statusOrder = useMemo(
    () => new Map(config.statuses.map((status) => [status.key, status.sortOrder])),
    [config.statuses]
  );

  const activeTransitions = useMemo(
    () =>
      sortTransitions(
        config.transitions.filter((t) => t.enabled),
        statusOrder
      ),
    [config.transitions, statusOrder]
  );
  const inactiveTransitions = useMemo(
    () =>
      sortTransitions(
        config.transitions.filter((t) => !t.enabled),
        statusOrder
      ),
    [config.transitions, statusOrder]
  );

  const selectedKey =
    selectedFromKey && selectedTargetKey
      ? `${selectedFromKey}:${selectedTargetKey}`
      : null;

  const [expandedKey, setExpandedKey] = useState<string | null>(selectedKey);

  useEffect(() => {
    if (selectedKey) setExpandedKey(selectedKey);
  }, [selectedKey]);

  if (config.transitions.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-[13px] text-slate-500 dark:border-[var(--border)] dark:text-white/45"
        data-testid="lifecycle-gates-empty"
      >
        No transitions yet — add moves on the Transitions tab first.
      </div>
    );
  }

  const renderTransitionList = (
    transitions: ReleaseLifecycleTransitionConfig[]
  ) => (
    <ul className="divide-y divide-slate-100 dark:divide-white/10">
      {transitions.map((transition) => {
        const targetKey = releaseLifecycleTargetKey(transition);
        const rowKey = transitionRowKey(transition);
        const expanded = expandedKey === rowKey;
        const fromLabel =
          config.statuses.find((s) => s.key === transition.fromKey)?.label ??
          transition.fromKey;
        const toLabel = transitionTargetLabel(transition, config.statuses);
        const { attached, available } = partitionTransitionGateCatalog(transition);
        const enforcementLabel =
          transition.enforcement === "required" ? "Required" : "Flexible";

        return (
          <li
            key={rowKey}
            className={cn(
              expanded && "bg-slate-50/80 dark:bg-white/[0.03]",
              selectedKey === rowKey && "ring-1 ring-inset ring-brand-500/30"
            )}
            data-testid={`lifecycle-gates-transition-${rowKey}`}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04]"
              aria-expanded={expanded}
              onClick={() =>
                setExpandedKey((prev) => (prev === rowKey ? null : rowKey))
              }
              data-testid={`lifecycle-gates-expand-${rowKey}`}
            >
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
                  {fromLabel} → {toLabel}
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/50">
                  {attached.length} active check
                  {attached.length === 1 ? "" : "s"} · {enforcementLabel}
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-slate-400 transition-transform dark:text-white/45",
                  expanded && "rotate-180"
                )}
                aria-hidden
              />
            </button>

            {expanded ? (
              <div className="space-y-4 border-t border-slate-100 px-4 py-4 dark:border-white/10">
                <section className="space-y-2">
                  <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-500 dark:text-white/50">
                    Active on this move ({attached.length})
                  </h4>
                  {attached.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-[13px] text-slate-500 dark:border-[var(--border)] dark:text-white/45">
                      No checks attached yet — anyone can take this move (when the
                      transition is On).
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-[var(--border)]">
                      {attached.map((gateType) => (
                        <GateListRow
                          key={gateType}
                          gateType={gateType}
                          attached
                          editing={editing}
                          fromKey={transition.fromKey}
                          targetKey={targetKey}
                          onToggleGate={onToggleGate}
                        />
                      ))}
                    </ul>
                  )}
                </section>

                <section className="space-y-2">
                  <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-500 dark:text-white/50">
                    Available checks — attach more ({available.length})
                  </h4>
                  {available.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-[13px] text-slate-500 dark:border-[var(--border)] dark:text-white/45">
                      All catalog checks are attached to this move.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-[var(--border)]">
                      {available.map((gateType) => (
                        <GateListRow
                          key={gateType}
                          gateType={gateType}
                          attached={false}
                          editing={editing}
                          fromKey={transition.fromKey}
                          targetKey={targetKey}
                          onToggleGate={onToggleGate}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-4" data-testid="lifecycle-gates-panel">
      <p className="text-[13px] text-slate-600 dark:text-white/65">
        Open any move below to see and attach its homework checks. Attaching a check
        moves it into Active for that move — it will not stay listed under Available.
        You do not need to select anything on Transitions first.
      </p>

      <LifecycleSection
        title="Active"
        count={activeTransitions.length}
        emptyMessage="No active transitions — turn a move On on the Transitions tab."
        testId="lifecycle-gates-active"
      >
        {activeTransitions.length > 0
          ? renderTransitionList(activeTransitions)
          : null}
      </LifecycleSection>

      <LifecycleSection
        title="Inactive"
        count={inactiveTransitions.length}
        emptyMessage="No inactive transitions."
        testId="lifecycle-gates-inactive"
      >
        {inactiveTransitions.length > 0
          ? renderTransitionList(inactiveTransitions)
          : null}
      </LifecycleSection>
    </div>
  );
}

function GateListRow({
  gateType,
  attached,
  editing,
  fromKey,
  targetKey,
  onToggleGate,
}: {
  gateType: ReleaseLifecycleGateType;
  attached: boolean;
  editing: boolean;
  fromKey: string;
  targetKey: string;
  onToggleGate: GatesPanelProps["onToggleGate"];
}) {
  const meta = RELEASE_LIFECYCLE_GATE_CATALOG[gateType];
  const alwaysPass = isAlwaysPassLifecycleGate(gateType);
  return (
    <li
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 px-4 py-3",
        attached && "bg-brand-500/5 dark:bg-brand-500/10"
      )}
      data-testid={`lifecycle-gate-row-${gateType}`}
    >
      <div className="min-w-0 max-w-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold text-slate-900 dark:text-white">
            {meta.label}
          </span>
          {attached ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
              Active on this move
            </span>
          ) : null}
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
      <LifecycleToggle
        checked={attached}
        onCheckedChange={(enabled) =>
          onToggleGate(fromKey, targetKey, gateType, enabled)
        }
        label={attached ? "Attached" : "Off"}
        disabled={!editing}
        title={
          attached
            ? "Detach — this check will no longer run for this move"
            : "Attach — this check will run when someone takes this move"
        }
        aria-label={`${meta.label} ${attached ? "Attached" : "Off"}`}
        data-testid={`lifecycle-gate-toggle-${gateType}`}
      />
    </li>
  );
}
