"use client";

/**
 * Lifecycle → Drifts — configure statuses and transitions (config drift detection).
 */
import { useCallback, useEffect, useState } from "react";
import { GitCompare, Pencil, Save, X } from "lucide-react";
import {
  createDefaultDriftLifecycleConfig,
  type DriftLifecycleConfig,
} from "@/lib/drift-lifecycle-config";
import { lifecycleEditModeLabel } from "@/lib/lifecycle-edit-mode-label";
import { LifecycleToggle } from "@/components/settings/lifecycle/LifecycleToggle";
import { StatusAvailabilityToggle } from "@/components/settings/lifecycle/StatusAvailabilityToggle";
import { driftGate, type DriftLifecycleGateType } from "@/lib/drift-lifecycle-gates";
import { DriftGatesPanel } from "@/components/settings/lifecycle/DriftGatesPanel";
import { EntityTransitionsList } from "@/components/settings/lifecycle/EntityTransitionsList";
import { ExclusiveRoleWarning } from "@/components/settings/lifecycle/ExclusiveRoleWarning";
import { StatusMeaningControls } from "@/components/settings/lifecycle/StatusMeaningEditor";
import { DRIFT_STATUS_ROLE_IDS } from "@/lib/lifecycle-status-roles";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";

function cloneConfig(config: DriftLifecycleConfig): DriftLifecycleConfig {
  return {
    statuses: config.statuses.map((s) => ({ ...s })),
    transitions: config.transitions.map((t) => ({
      ...t,
      gates: (t.gates ?? []).map((gate) => ({ ...gate })),
    })),
  };
}

/**
 * Drift lifecycle settings panel (statuses + transitions).
 */
export function DriftLifecycleSettings() {
  const [baseline, setBaseline] = useState(createDefaultDriftLifecycleConfig);
  const [draft, setDraft] = useState(createDefaultDriftLifecycleConfig);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"statuses" | "transitions" | "gates">(
    "statuses"
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/drift-lifecycle-config", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { config: DriftLifecycleConfig };
      const config = data.config ?? createDefaultDriftLifecycleConfig();
      setBaseline(cloneConfig(config));
      setDraft(cloneConfig(config));
    } catch {
      setError("Could not load drift lifecycle configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleGate = (
    fromKey: string,
    toKey: string,
    gateType: DriftLifecycleGateType,
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
          gates.push(driftGate(gateType, (gates.length + 1) * 10));
        }
        return { ...transition, gates };
      }),
    }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/drift-lifecycle-config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const data = (await res.json()) as {
        config?: DriftLifecycleConfig;
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
        Loading drift lifecycle…
      </div>
    );
  }

  const sortedStatuses = [...draft.statuses].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-5" data-testid="drift-lifecycle-settings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/12 text-teal-700 dark:text-teal-300">
            <GitCompare className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">
              Drift Lifecycle
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500 dark:text-white/50">
              Configure config-drift statuses, allowed moves, and checks.
              Resolved stays editable until Closed. Reverted is a live-only
              final (config restored). Closed is the freeze after Resolved.
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
        <p className="font-semibold">Quick help · Drifts</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>Open → In Progress, Scheduled, or Escalated. Direct Resolved / Reverted from Open stay as early exits.</li>
          <li>In Progress ↔ Scheduled ↔ Escalated. Resolved is working — Close when the record should freeze.</li>
          <li>Reverted stays a live-only final (undo / restore original baseline). It is not Closed.</li>
          <li>In Progress needs review notes, Scheduled needs an ETA, Resolved needs baseline notes. Flexible — an exception reason can override.</li>
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

      {panel === "statuses" ? (
        <div className="space-y-3">
        <ExclusiveRoleWarning
          statuses={draft.statuses}
          roleIds={DRIFT_STATUS_ROLE_IDS}
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
                  roleIds={DRIFT_STATUS_ROLE_IDS}
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
      ) : null}

      {panel === "transitions" ? (
        <EntityTransitionsList
          statuses={draft.statuses}
          transitions={draft.transitions}
          editing={editing}
          onToggleEnabled={(fromKey, toKey, enabled) => {
            setDraft((prev) => ({
              ...prev,
              transitions: prev.transitions.map((t) =>
                t.fromKey === fromKey && t.toKey === toKey
                  ? { ...t, enabled }
                  : t
              ),
            }));
          }}
          onToggleEnforcement={(fromKey, toKey, required) => {
            setDraft((prev) => ({
              ...prev,
              transitions: prev.transitions.map((t) =>
                t.fromKey === fromKey && t.toKey === toKey
                  ? { ...t, enforcement: required ? "required" : "flexible" }
                  : t
              ),
            }));
          }}
        />
      ) : null}

      {panel === "gates" ? (
        <DriftGatesPanel
          config={draft}
          editing={editing}
          onToggleGate={toggleGate}
        />
      ) : null}
    </div>
  );
}
