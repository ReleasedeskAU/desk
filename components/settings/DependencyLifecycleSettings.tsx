"use client";

/**
 * Lifecycle → Dependencies — configure statuses and transitions.
 */
import { useCallback, useEffect, useState } from "react";
import { Link2, Pencil, Save, X } from "lucide-react";
import {
  createDefaultDependencyLifecycleConfig,
  type DependencyLifecycleConfig,
  type DependencyLifecycleEnforcement,
} from "@/lib/dependency-lifecycle-config";
import {
  dependencyGate,
  type DependencyLifecycleGateType,
} from "@/lib/dependency-lifecycle-gates";
import { DependencyGatesPanel } from "@/components/settings/lifecycle/DependencyGatesPanel";
import { lifecycleEditModeLabel } from "@/lib/lifecycle-edit-mode-label";
import { LifecycleToggle } from "@/components/settings/lifecycle/LifecycleToggle";
import { StatusAvailabilityToggle } from "@/components/settings/lifecycle/StatusAvailabilityToggle";
import { ExclusiveRoleWarning } from "@/components/settings/lifecycle/ExclusiveRoleWarning";
import { StatusMeaningControls } from "@/components/settings/lifecycle/StatusMeaningEditor";
import { DEPENDENCY_STATUS_ROLE_IDS } from "@/lib/lifecycle-status-roles";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";

function cloneConfig(config: DependencyLifecycleConfig): DependencyLifecycleConfig {
  return {
    statuses: config.statuses.map((s) => ({ ...s })),
    transitions: config.transitions.map((t) => ({
      ...t,
      gates: (t.gates ?? []).map((gate) => ({ ...gate })),
    })),
  };
}

/**
 * Dependency lifecycle settings panel (statuses + transitions).
 */
export function DependencyLifecycleSettings() {
  const [baseline, setBaseline] = useState(createDefaultDependencyLifecycleConfig);
  const [draft, setDraft] = useState(createDefaultDependencyLifecycleConfig);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"statuses" | "transitions" | "gates">(
    "statuses"
  );

  const toggleGate = (
    fromKey: string,
    toKey: string,
    gateType: DependencyLifecycleGateType,
    enabled: boolean
  ) => {
    setDraft((previous) => ({
      ...previous,
      transitions: previous.transitions.map((transition) => {
        if (transition.fromKey !== fromKey || transition.toKey !== toKey) {
          return transition;
        }
        const gates = [...(transition.gates ?? [])];
        const index = gates.findIndex((gate) => gate.gateType === gateType);
        if (index >= 0) {
          gates[index] = { ...gates[index]!, enabled };
        } else {
          gates.push(dependencyGate(gateType, (gates.length + 1) * 10));
        }
        return { ...transition, gates };
      }),
    }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dependency-lifecycle-config", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { config: DependencyLifecycleConfig };
      const config = data.config ?? createDefaultDependencyLifecycleConfig();
      setBaseline(cloneConfig(config));
      setDraft(cloneConfig(config));
    } catch {
      setError("Could not load dependency lifecycle configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dependency-lifecycle-config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const data = (await res.json()) as {
        config?: DependencyLifecycleConfig;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      const config = data.config ?? draft;
      setBaseline(cloneConfig(config));
      setDraft(cloneConfig(config));
      setEditing(false);
    } catch {
      setError("Save failed — try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-[var(--border)] dark:bg-[var(--card)]">
        Loading dependency lifecycle…
      </div>
    );
  }

  const sortedStatuses = [...draft.statuses].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-5" data-testid="dependency-lifecycle-settings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/12 text-cyan-700 dark:text-cyan-300">
            <Link2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">
              Dependency Lifecycle
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500 dark:text-white/50">
              Configure dependency statuses, allowed moves, and checks. Met / Waived /
              Removed stay terminal; Hard deps must satisfy the hard-gate flag before
              Deploying.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editing ? (
            <button
              type="button"
              className={cn(taBtnPrimary, "gap-1.5")}
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          ) : (
            <>
              <button
                type="button"
                className={cn(taBtnSecondary, "gap-1.5")}
                disabled={saving}
                onClick={() => {
                  setDraft(cloneConfig(baseline));
                  setEditing(false);
                  setError(null);
                }}
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                type="button"
                className={cn(taBtnPrimary, "gap-1.5")}
                disabled={saving}
                onClick={() => void save()}
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      <div
        className="rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-[12.5px] leading-relaxed text-sky-950 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100"
        role="note"
      >
        <p className="font-semibold">Quick help · Dependencies</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>Identified is the starting status; Confirmed (dual-ack) is deferred.</li>
          <li>Met, Waived, and Removed are terminal — no silent revert for users (AV-26 is system-only).</li>
          <li>Waiving or removing requires documented approval in notes (or an exception reason).</li>
          <li>Legacy Clear / Resolved still map to Met. Blocked is now a real status.</li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["statuses", "Statuses"],
            ["transitions", "Transitions"],
            ["gates", "Checks"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={panel === id}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              panel === id
                ? "bg-brand-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-white/70"
            )}
            onClick={() => setPanel(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {panel === "gates" ? (
        <DependencyGatesPanel
          config={draft}
          editing={editing}
          onToggleGate={toggleGate}
        />
      ) : panel === "statuses" ? (
        <div className="space-y-3">
        <ExclusiveRoleWarning
          statuses={draft.statuses}
          roleIds={DEPENDENCY_STATUS_ROLE_IDS}
        />
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-[var(--border)]">
          {sortedStatuses.map((status) => (
            <li
              key={status.key}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
                  {status.label}
                  {status.terminal ? (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-white/10">
                      Terminal
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/55">
                  {status.cascadeEffect}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {lifecycleEditModeLabel(status.editMode)}
                </p>
                <StatusMeaningControls
                  roleIds={DEPENDENCY_STATUS_ROLE_IDS}
                  statuses={draft.statuses}
                  statusKey={status.key}
                  editing={editing}
                  onStatusesChange={(statuses) =>
                    setDraft((prev) => ({ ...prev, statuses }))
                  }
                />
              </div>
              <StatusAvailabilityToggle
                checked={status.enabled}
                disabled={!editing}
                statusLabel={status.label}
                onCheckedChange={(enabled) => {
                  setDraft((prev) => ({
                    ...prev,
                    statuses: prev.statuses.map((s) =>
                      s.key === status.key ? { ...s, enabled } : s
                    ),
                  }));
                }}
              />
            </li>
          ))}
        </ul>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-[var(--border)]">
          {draft.transitions
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((transition) => {
              const from =
                draft.statuses.find((s) => s.key === transition.fromKey)?.label ??
                transition.fromKey;
              const to =
                draft.statuses.find((s) => s.key === transition.toKey)?.label ??
                transition.toKey;
              return (
                <li
                  key={`${transition.fromKey}:${transition.toKey}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
                    {from} → {to}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <LifecycleToggle
                      checked={transition.enabled}
                      disabled={!editing}
                      label={transition.enabled ? "On" : "Off"}
                      onCheckedChange={(enabled) => {
                        setDraft((prev) => ({
                          ...prev,
                          transitions: prev.transitions.map((t) =>
                            t.fromKey === transition.fromKey &&
                            t.toKey === transition.toKey
                              ? { ...t, enabled }
                              : t
                          ),
                        }));
                      }}
                    />
                    <LifecycleToggle
                      checked={transition.enforcement === "required"}
                      disabled={!editing}
                      label={
                        transition.enforcement === "required" ? "Required" : "Flexible"
                      }
                      onCheckedChange={(required) => {
                        const enforcement: DependencyLifecycleEnforcement = required
                          ? "required"
                          : "flexible";
                        setDraft((prev) => ({
                          ...prev,
                          transitions: prev.transitions.map((t) =>
                            t.fromKey === transition.fromKey &&
                            t.toKey === transition.toKey
                              ? { ...t, enforcement }
                              : t
                          ),
                        }));
                      }}
                    />
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
