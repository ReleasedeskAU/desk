"use client";

/**
 * Lifecycle → Conflicts — configure statuses, transitions, and conflict types.
 */
import { useCallback, useEffect, useState } from "react";
import { Pencil, Save, Swords, X } from "lucide-react";
import {
  createDefaultConflictLifecycleConfig,
  type ConflictLifecycleConfig,
} from "@/lib/conflict-lifecycle-config";
import { lifecycleEditModeLabel } from "@/lib/lifecycle-edit-mode-label";
import { LifecycleToggle } from "@/components/settings/lifecycle/LifecycleToggle";
import { EntityTransitionsList } from "@/components/settings/lifecycle/EntityTransitionsList";
import { ExclusiveRoleWarning } from "@/components/settings/lifecycle/ExclusiveRoleWarning";
import { StatusMeaningControls } from "@/components/settings/lifecycle/StatusMeaningEditor";
import { INTAKE_ONLY_ROLE_IDS } from "@/lib/lifecycle-status-roles";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";

function cloneConfig(config: ConflictLifecycleConfig): ConflictLifecycleConfig {
  return {
    statuses: config.statuses.map((s) => ({ ...s })),
    transitions: config.transitions.map((t) => ({ ...t })),
    types: config.types.map((t) => ({ ...t })),
  };
}

/**
 * Conflict lifecycle settings panel (statuses + transitions + types).
 */
export function ConflictLifecycleSettings() {
  const [baseline, setBaseline] = useState(createDefaultConflictLifecycleConfig);
  const [draft, setDraft] = useState(createDefaultConflictLifecycleConfig);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"statuses" | "transitions" | "types">(
    "statuses"
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/conflict-lifecycle-config", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { config: ConflictLifecycleConfig };
      const config = data.config ?? createDefaultConflictLifecycleConfig();
      setBaseline(cloneConfig(config));
      setDraft(cloneConfig(config));
    } catch {
      setError("Could not load conflict lifecycle configuration.");
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
      const res = await fetch("/api/conflict-lifecycle-config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const data = (await res.json()) as {
        config?: ConflictLifecycleConfig;
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
        Loading conflict lifecycle…
      </div>
    );
  }

  const sortedStatuses = [...draft.statuses].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedTypes = [...draft.types].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-5" data-testid="conflict-lifecycle-settings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300">
            <Swords className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">
              Conflict Lifecycle
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500 dark:text-white/50">
              Configure conflict statuses, allowed moves, and conflict types (Schedule, Resource,
              Application). Resolved and Dismissed are terminal.
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
        <p className="font-semibold">Quick help · Conflicts</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>Detected → Under Review / Resolved / Dismissed (Flexible).</li>
          <li>Resolved and Dismissed are terminal and immutable.</li>
          <li>Dismissing requires justification in notes (or an exception reason).</li>
          <li>Legacy Open / In Progress / Escalated map into the new vocabulary.</li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["statuses", "Statuses"],
            ["transitions", "Transitions"],
            ["types", "Types"],
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
          roleIds={INTAKE_ONLY_ROLE_IDS}
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
                  roleIds={INTAKE_ONLY_ROLE_IDS}
                  statuses={draft.statuses}
                  statusKey={status.key}
                  editing={editing}
                  onStatusesChange={(statuses) =>
                    setDraft((prev) => ({ ...prev, statuses }))
                  }
                />
              </div>
              <LifecycleToggle
                checked={status.enabled}
                disabled={!editing}
                label={status.enabled ? "On" : "Off"}
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

      {panel === "types" ? (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-[var(--border)]">
          {sortedTypes.map((type) => (
            <li
              key={type.key}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
                  {type.label}
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/55">
                  {type.description}
                </p>
                <p className="mt-1 font-mono text-[11px] text-slate-400">{type.key}</p>
              </div>
              <LifecycleToggle
                checked={type.enabled}
                disabled={!editing}
                label={type.enabled ? "On" : "Off"}
                onCheckedChange={(enabled) => {
                  setDraft((prev) => ({
                    ...prev,
                    types: prev.types.map((t) =>
                      t.key === type.key ? { ...t, enabled } : t
                    ),
                  }));
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
