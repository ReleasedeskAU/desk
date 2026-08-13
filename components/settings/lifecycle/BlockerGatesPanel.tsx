"use client";

/**
 * Checks tab for Blocker Lifecycle — attach catalog gates to each move.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  BLOCKER_LIFECYCLE_GATE_CATALOG,
  BLOCKER_LIFECYCLE_GATE_TYPES,
  type BlockerLifecycleGateType,
} from "@/lib/blocker-lifecycle-gates";
import type { BlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config";
import { LifecycleToggle } from "@/components/settings/lifecycle/LifecycleToggle";
import { cn } from "@/lib/utils";

export type BlockerGatesPanelProps = {
  config: BlockerLifecycleConfig;
  editing: boolean;
  onToggleGate: (
    fromKey: string,
    toKey: string,
    gateType: BlockerLifecycleGateType,
    enabled: boolean
  ) => void;
};

function partition(attachedTypes: Set<string>): {
  attached: BlockerLifecycleGateType[];
  available: BlockerLifecycleGateType[];
} {
  const attached: BlockerLifecycleGateType[] = [];
  const available: BlockerLifecycleGateType[] = [];
  for (const gateType of BLOCKER_LIFECYCLE_GATE_TYPES) {
    if (attachedTypes.has(gateType)) attached.push(gateType);
    else available.push(gateType);
  }
  return { attached, available };
}

/**
 * List Active/Inactive blocker transitions; expand a row to attach checks.
 */
export function BlockerGatesPanel({
  config,
  editing,
  onToggleGate,
}: BlockerGatesPanelProps) {
  const statusOrder = useMemo(
    () => new Map(config.statuses.map((s) => [s.key, s.sortOrder])),
    [config.statuses]
  );
  const sorted = useMemo(
    () =>
      [...config.transitions].sort((a, b) => {
        const fromDiff =
          (statusOrder.get(a.fromKey) ?? 0) - (statusOrder.get(b.fromKey) ?? 0);
        return fromDiff !== 0 ? fromDiff : a.sortOrder - b.sortOrder;
      }),
    [config.transitions, statusOrder]
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    if (sorted.length === 1) setExpandedKey(`${sorted[0]!.fromKey}:${sorted[0]!.toKey}`);
  }, [sorted]);

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-[13px] text-slate-500 dark:border-[var(--border)]">
        No transitions yet — add moves on the Transitions tab first.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-[var(--border)]">
      {sorted.map((transition) => {
        const rowKey = `${transition.fromKey}:${transition.toKey}`;
        const expanded = expandedKey === rowKey;
        const fromLabel =
          config.statuses.find((s) => s.key === transition.fromKey)?.label ??
          transition.fromKey;
        const toLabel =
          config.statuses.find((s) => s.key === transition.toKey)?.label ??
          transition.toKey;
        const enabledTypes = new Set(
          (transition.gates ?? [])
            .filter((g) => g.enabled)
            .map((g) => g.gateType)
        );
        const { attached, available } = partition(enabledTypes);
        return (
          <li key={rowKey} className={cn(expanded && "bg-slate-50/80 dark:bg-white/[0.03]")}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/[0.04]"
              aria-expanded={expanded}
              onClick={() =>
                setExpandedKey((prev) => (prev === rowKey ? null : rowKey))
              }
            >
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
                  {fromLabel} → {toLabel}
                  {!transition.enabled ? (
                    <span className="ml-2 text-[11px] font-semibold text-slate-400">Off</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/50">
                  {attached.length} active check{attached.length === 1 ? "" : "s"} ·{" "}
                  {transition.enforcement === "required" ? "Required" : "Flexible"}
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                  expanded && "rotate-180"
                )}
                aria-hidden
              />
            </button>
            {expanded ? (
              <div className="space-y-4 border-t border-slate-100 px-4 py-4 dark:border-white/10">
                <GateGroup
                  title={`Active on this move (${attached.length})`}
                  empty="No checks attached yet — anyone can take this move when the transition is On."
                  types={attached}
                  attached
                  editing={editing}
                  fromKey={transition.fromKey}
                  toKey={transition.toKey}
                  onToggleGate={onToggleGate}
                />
                <GateGroup
                  title={`Available checks — attach more (${available.length})`}
                  empty="All catalog checks are attached to this move."
                  types={available}
                  attached={false}
                  editing={editing}
                  fromKey={transition.fromKey}
                  toKey={transition.toKey}
                  onToggleGate={onToggleGate}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function GateGroup(props: {
  title: string;
  empty: string;
  types: BlockerLifecycleGateType[];
  attached: boolean;
  editing: boolean;
  fromKey: string;
  toKey: string;
  onToggleGate: BlockerGatesPanelProps["onToggleGate"];
}) {
  return (
    <section className="space-y-2">
      <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-500 dark:text-white/50">
        {props.title}
      </h4>
      {props.types.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-[13px] text-slate-500 dark:border-[var(--border)]">
          {props.empty}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-[var(--border)]">
          {props.types.map((gateType) => {
            const def = BLOCKER_LIFECYCLE_GATE_CATALOG[gateType];
            return (
              <li
                key={gateType}
                className="flex items-start justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
                    {def.label}
                  </p>
                  <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/55">
                    {def.description}
                  </p>
                </div>
                <LifecycleToggle
                  checked={props.attached}
                  disabled={!props.editing}
                  label={props.attached ? "On" : "Off"}
                  onCheckedChange={(enabled) =>
                    props.onToggleGate(props.fromKey, props.toKey, gateType, enabled)
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
