"use client";

/**
 * Lifecycle → Incidents — configure statuses and transitions.
 */
import { useCallback, useEffect, useState } from "react";
import { Siren, Pencil, Save, X } from "lucide-react";
import {
  createDefaultIncidentLifecycleConfig,
  type IncidentLifecycleConfig,
  type IncidentLifecycleEnforcement,
} from "@/lib/incident-lifecycle-config";
import { incidentGate, type IncidentLifecycleGateType } from "@/lib/incident-lifecycle-gates";
import { IncidentGatesPanel } from "@/components/settings/lifecycle/IncidentGatesPanel";
import { lifecycleEditModeLabel } from "@/lib/lifecycle-edit-mode-label";
import { LifecycleToggle } from "@/components/settings/lifecycle/LifecycleToggle";
import { ExclusiveRoleWarning } from "@/components/settings/lifecycle/ExclusiveRoleWarning";
import { StatusMeaningEditor } from "@/components/settings/lifecycle/StatusMeaningEditor";
import {
  applyStatusRolePatch,
  exclusiveRoleIds,
  INCIDENT_STATUS_ROLE_IDS,
  statusRoleFieldsFor,
} from "@/lib/lifecycle-status-roles";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";

const INCIDENT_STATUS_OWNER_HINT: Record<string, string> = {
  open: "Service Desk",
  acknowledged: "Incident Owner",
  investigating: "Incident Owner",
  escalated: "Escalation Manager",
  resolving: "Incident Owner",
  resolved: "Incident Owner",
  closed: "Service Desk",
  reopened: "Incident Owner",
};

function cloneConfig(config: IncidentLifecycleConfig): IncidentLifecycleConfig {
  return {
    statuses: config.statuses.map((s) => ({ ...s })),
    transitions: config.transitions.map((t) => ({
      ...t,
      gates: (t.gates ?? []).map((g) => ({ ...g })),
    })),
  };
}

/**
 * Incident lifecycle settings panel (statuses + transitions).
 */
export function IncidentLifecycleSettings() {
  const [baseline, setBaseline] = useState(createDefaultIncidentLifecycleConfig);
  const [draft, setDraft] = useState(createDefaultIncidentLifecycleConfig);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"statuses" | "transitions" | "gates">("statuses");

  const toggleGate = (
    fromKey: string,
    toKey: string,
    gateType: IncidentLifecycleGateType,
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
        } else {
          gates.push(incidentGate(gateType, (gates.length + 1) * 10));
        }
        return { ...t, gates };
      }),
    }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/incident-lifecycle-config", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { config: IncidentLifecycleConfig };
      const config = data.config ?? createDefaultIncidentLifecycleConfig();
      setBaseline(cloneConfig(config));
      setDraft(cloneConfig(config));
    } catch {
      setError("Could not load incident lifecycle configuration.");
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
      const res = await fetch("/api/incident-lifecycle-config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const data = (await res.json()) as {
        config?: IncidentLifecycleConfig;
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
        Loading incident lifecycle…
      </div>
    );
  }

  const sortedStatuses = [...draft.statuses].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-5" data-testid="incident-lifecycle-settings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/12 text-orange-700 dark:text-orange-300">
            <Siren className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">
              Incident Lifecycle
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500 dark:text-white/50">
              Configure incident statuses, allowed moves, and edit rules. Flexible edges warn
              and allow override (e.g. Critical without owner).
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
        <p className="font-semibold">Quick help · Incidents</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>Active → Acknowledged / Investigating. Acknowledged → Investigating / Resolved.</li>
          <li>Closed is terminal and immutable (Required). Other moves are Flexible unless you change them.</li>
          <li>Critical incidents leaving the starting status need an owner or an exception reason (VR-13).</li>
          <li>
            “What this status does” marks the starting status, which stages block a linked
            release, and which status unblocks it — rename labels without breaking those checks.
          </li>
          <li>
            Accountable owner (Service Desk / Incident Owner / Escalation Manager) is
            display-only — not enforced against Clerk roles.
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
        <IncidentGatesPanel
          config={draft}
          editing={editing}
          onToggleGate={toggleGate}
        />
      ) : panel === "statuses" ? (
        <div className="space-y-3">
        <ExclusiveRoleWarning
          statuses={draft.statuses}
          roleIds={INCIDENT_STATUS_ROLE_IDS}
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
                  {INCIDENT_STATUS_OWNER_HINT[status.key]
                    ? ` · accountable (display): ${INCIDENT_STATUS_OWNER_HINT[status.key]}`
                    : ""}
                </p>
                <StatusMeaningEditor
                  fields={statusRoleFieldsFor(INCIDENT_STATUS_ROLE_IDS)}
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
                        exclusiveRoleIds(INCIDENT_STATUS_ROLE_IDS)
                      ),
                    }));
                  }}
                  onDaysChange={() => undefined}
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
                        const enforcement: IncidentLifecycleEnforcement = required
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
