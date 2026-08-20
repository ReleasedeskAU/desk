"use client";

/**
 * Lifecycle → Blockers — configure statuses, transitions, cascade notes.
 */
import { useCallback, useEffect, useState } from "react";
import { Ban, Pencil, Save, X } from "lucide-react";
import {
  BLOCKER_STATUS_OWNER_HINT,
  createDefaultBlockerLifecycleConfig,
  type BlockerLifecycleConfig,
} from "@/lib/blocker-lifecycle-config";
import { blockerGate, type BlockerLifecycleGateType } from "@/lib/blocker-lifecycle-gates";
import { lifecycleEditModeLabel } from "@/lib/lifecycle-edit-mode-label";
import { LifecycleToggle } from "@/components/settings/lifecycle/LifecycleToggle";
import { StatusAvailabilityToggle } from "@/components/settings/lifecycle/StatusAvailabilityToggle";
import { EntityTransitionsList } from "@/components/settings/lifecycle/EntityTransitionsList";
import { BlockerGatesPanel } from "@/components/settings/lifecycle/BlockerGatesPanel";
import { ExclusiveRoleWarning } from "@/components/settings/lifecycle/ExclusiveRoleWarning";
import { StatusMeaningEditor } from "@/components/settings/lifecycle/StatusMeaningEditor";
import {
  applyStatusRolePatch,
  BLOCKER_STATUS_ROLE_IDS,
  exclusiveRoleIds,
  statusRoleFieldsFor,
} from "@/lib/lifecycle-status-roles";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";

function cloneConfig(config: BlockerLifecycleConfig): BlockerLifecycleConfig {
  return {
    statuses: config.statuses.map((s) => ({ ...s })),
    transitions: config.transitions.map((t) => ({
      ...t,
      gates: (t.gates ?? []).map((g) => ({ ...g })),
    })),
  };
}

/**
 * Blocker lifecycle settings panel (statuses + transitions).
 */
export function BlockerLifecycleSettings() {
  const [baseline, setBaseline] = useState(createDefaultBlockerLifecycleConfig);
  const [draft, setDraft] = useState(createDefaultBlockerLifecycleConfig);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"statuses" | "transitions" | "gates">("statuses");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/blocker-lifecycle-config", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { config: BlockerLifecycleConfig };
      const config = data.config ?? createDefaultBlockerLifecycleConfig();
      setBaseline(cloneConfig(config));
      setDraft(cloneConfig(config));
    } catch {
      setError("Could not load blocker lifecycle configuration.");
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
      const res = await fetch("/api/blocker-lifecycle-config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const data = (await res.json()) as { config?: BlockerLifecycleConfig; error?: string };
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

  const toggleGate = (
    fromKey: string,
    toKey: string,
    gateType: BlockerLifecycleGateType,
    enabled: boolean
  ) => {
    setDraft((prev) => ({
      ...prev,
      transitions: prev.transitions.map((t) => {
        if (t.fromKey !== fromKey || t.toKey !== toKey) return t;
        const gates = [...(t.gates ?? [])];
        const idx = gates.findIndex((g) => g.gateType === gateType);
        if (idx >= 0) {
          gates[idx] = { ...gates[idx]!, enabled };
        } else if (enabled) {
          gates.push(blockerGate(gateType, (gates.length + 1) * 10));
        }
        return { ...t, gates };
      }),
    }));
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-[var(--border)] dark:bg-[var(--card)]">
        Loading blocker lifecycle…
      </div>
    );
  }

  const sortedStatuses = [...draft.statuses].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-5" data-testid="blocker-lifecycle-settings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/12 text-rose-700 dark:text-rose-300">
            <Ban className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">
              Blocker Lifecycle
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500 dark:text-white/50">
              Configure blocker statuses, allowed moves, homework checks, cascade
              effects on releases, and edit rules. Owner labels are informational
              only — they are not permission checks.
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
        <p className="font-semibold">Quick help · Blockers</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>Statuses with “blocks Ready” keep a release from moving to Ready.</li>
          <li>Closed / Cancelled are terminal (Required). Other moves are Flexible unless you change them.</li>
          <li>Flexible = unmet checks need a written exception. Required = the move is blocked.</li>
          <li>In Progress can raise a stale alert after N days — set “Stale after (days)” on that status.</li>
          <li>
            “What this status does” (blocks Ready, starting status, unblocks release) is how
            automations find the right stage if you rename labels.
          </li>
          <li>
            Accountable owner (Release Manager / Blocker Owner / Manager) is display-only
            for now — not enforced against Clerk roles.
          </li>
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
        <BlockerGatesPanel
          config={draft}
          editing={editing}
          onToggleGate={toggleGate}
        />
      ) : panel === "statuses" ? (
        <div className="space-y-3">
        <ExclusiveRoleWarning
          statuses={draft.statuses}
          roleIds={BLOCKER_STATUS_ROLE_IDS}
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
                  {BLOCKER_STATUS_OWNER_HINT[status.key]
                    ? ` · accountable (display): ${BLOCKER_STATUS_OWNER_HINT[status.key]}`
                    : ""}
                </p>
                <StatusMeaningEditor
                  fields={statusRoleFieldsFor(BLOCKER_STATUS_ROLE_IDS)}
                  values={status}
                  editing={editing}
                  statusLabel={status.label}
                  onToggle={(id, checked) => {
                    setDraft((prev) => ({
                      ...prev,
                      statuses: applyStatusRolePatch(
                        prev.statuses,
                        status.key,
                        { [id]: checked } as Partial<(typeof prev.statuses)[number]>,
                        exclusiveRoleIds(BLOCKER_STATUS_ROLE_IDS)
                      ),
                    }));
                  }}
                  onDaysChange={(id, days) => {
                    setDraft((prev) => ({
                      ...prev,
                      statuses: prev.statuses.map((s) =>
                        s.key === status.key ? { ...s, [id]: days } : s
                      ),
                    }));
                  }}
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
      )}
    </div>
  );
}
