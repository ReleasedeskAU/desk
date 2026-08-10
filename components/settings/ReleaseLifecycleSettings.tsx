"use client";

/**
 * Settings → Release Lifecycle — per-user statuses, transitions, and fixed-catalog gates.
 * Matches the Risk Engine settings pattern: section cards, Edit / Save / Cancel per page.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleHelp, GitBranch, Pencil, Save, X } from "lucide-react";
import {
  createDefaultReleaseLifecycleConfig,
  validateReleaseLifecycleConfig,
  type ReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config";
import {
  addLifecycleStatus,
  addLifecycleTransition,
  cloneLifecycleConfig,
  removeLifecycleStatus,
  removeLifecycleTransition,
  reorderLifecycleStatuses,
  setLifecycleTransitionEnforcement,
  toggleLifecycleGate,
  toggleLifecycleStatus,
  toggleLifecycleTransition,
  type StatusUsageMap,
} from "@/lib/release-lifecycle-settings-ui";
import type { ReleaseLifecycleGateType } from "@/lib/release-lifecycle-gates";
import { StatusesPanel } from "@/components/settings/lifecycle/StatusesPanel";
import { TransitionsPanel } from "@/components/settings/lifecycle/TransitionsPanel";
import { GatesPanel } from "@/components/settings/lifecycle/GatesPanel";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";

type PanelId = "statuses" | "transitions" | "gates";

const LIFECYCLE_TAB_HELP: Record<
  PanelId,
  { title: string; points: string[] }
> = {
  statuses: {
    title: "Quick help · Statuses",
    points: [
      "Statuses are the stages a release can sit in (Draft, Planning, Testing…).",
      "Use On/Off to hide a stage you don’t use — don’t delete defaults.",
      "Drag the ⋮⋮ handle to rearrange. That order is what the release detail timeline shows.",
      "Only unused custom statuses can be removed.",
    ],
  },
  transitions: {
    title: "Quick help · Transitions",
    points: [
      "A transition is an allowed move from one stage to another (for example UAT → Pending CAB).",
      "On = people can pick this move. Off = the move is hidden.",
      "Flexible = if a gate fails, you can still proceed with a written reason.",
      "Required = if a gate fails, the move is blocked — no override.",
      "“1 gate” means 1 homework check is attached to that move. Click the row to manage those checks.",
    ],
  },
  gates: {
    title: "Quick help · Gates",
    points: [
      "Gates are homework checks on a specific move (booking exists, owner set, no blockers…).",
      "“Active on this move” = the rules that actually run for the selected transition.",
      "“Available checks” = the full menu. Turn Attached on to add a check to this move.",
      "Whether a failed check blocks hard or allows an override is set on Transitions (Required vs Flexible).",
    ],
  },
};

/**
 * Plain-language help callout shared across Release Lifecycle tabs.
 */
function LifecycleHelpBox({
  title,
  points,
}: {
  title: string;
  points: string[];
}) {
  return (
    <div
      className="mb-4 rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 dark:border-sky-500/30 dark:bg-sky-500/10"
      data-testid="lifecycle-help-box"
      role="note"
    >
      <div className="flex items-start gap-2.5">
        <CircleHelp
          className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-sky-950 dark:text-sky-100">{title}</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-sky-900/85 dark:text-sky-100/80">
            {points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  step,
  title,
  subtitle,
  help,
  children,
}: {
  step: string;
  title: string;
  subtitle: string;
  help: { title: string; points: string[] };
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-[var(--border)] dark:bg-[var(--card)]">
      <div className="mb-4 flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[12px] font-bold text-brand-700 dark:text-brand-300">
          {step}
        </span>
        <div className="min-w-0">
          <h3 className="text-[16px] font-bold tracking-tight">{title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-white/50">
            {subtitle}
          </p>
        </div>
      </div>
      <LifecycleHelpBox title={help.title} points={help.points} />
      {children}
    </div>
  );
}

/**
 * Per-user Release Lifecycle settings tab (own config only).
 */
export function ReleaseLifecycleSettings() {
  const [baseline, setBaseline] = useState<ReleaseLifecycleConfig>(() =>
    createDefaultReleaseLifecycleConfig()
  );
  const [draft, setDraft] = useState<ReleaseLifecycleConfig>(() =>
    createDefaultReleaseLifecycleConfig()
  );
  const [usage, setUsage] = useState<StatusUsageMap>({});
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [enforcementWarning, setEnforcementWarning] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelId>("statuses");
  const [newLabel, setNewLabel] = useState("");
  const [newTerminal, setNewTerminal] = useState(false);
  const [addFrom, setAddFrom] = useState("");
  const [addTo, setAddTo] = useState("");
  const [selectedFromKey, setSelectedFromKey] = useState<string | null>(null);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);

  const selectedRowKey = useMemo(() => {
    if (!selectedFromKey || !selectedTargetKey) return null;
    return `${selectedFromKey}:${selectedTargetKey}`;
  }, [selectedFromKey, selectedTargetKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, usageRes] = await Promise.all([
        fetch("/api/release-lifecycle-config", { credentials: "same-origin" }),
        fetch("/api/release-lifecycle-config/status-usage", {
          credentials: "same-origin",
        }),
      ]);
      if (!configRes.ok) {
        const body = (await configRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to load lifecycle config");
      }
      const configBody = (await configRes.json()) as {
        config: ReleaseLifecycleConfig;
        warning?: { message?: string };
      };
      const next = cloneLifecycleConfig(configBody.config);
      setBaseline(next);
      setDraft(cloneLifecycleConfig(next));
      if (configBody.warning?.message) setWarning(configBody.warning.message);

      if (usageRes.ok) {
        const usageBody = (await usageRes.json()) as { usage?: StatusUsageMap };
        setUsage(usageBody.usage ?? {});
      } else {
        setUsage({});
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load lifecycle config"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const beginEdit = () => {
    setDraft(cloneLifecycleConfig(baseline));
    setEditing(true);
    setError(null);
    setEnforcementWarning(null);
  };

  const cancelEdit = () => {
    setDraft(cloneLifecycleConfig(baseline));
    setEditing(false);
    setError(null);
    setEnforcementWarning(null);
    setNewLabel("");
    setNewTerminal(false);
  };

  const save = async () => {
    const validationError = validateReleaseLifecycleConfig(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/release-lifecycle-config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await res.json().catch(() => null)) as
        | { config?: ReleaseLifecycleConfig; error?: string }
        | null;
      if (!res.ok || !body?.config) {
        throw new Error(body?.error ?? "Save failed");
      }
      const saved = cloneLifecycleConfig(body.config);
      setBaseline(saved);
      setDraft(cloneLifecycleConfig(saved));
      setEditing(false);
      setEnforcementWarning(null);
      // Refresh usage after save in case labels/keys changed.
      const usageRes = await fetch("/api/release-lifecycle-config/status-usage", {
        credentials: "same-origin",
      });
      if (usageRes.ok) {
        const usageBody = (await usageRes.json()) as { usage?: StatusUsageMap };
        setUsage(usageBody.usage ?? {});
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const applyResult = (
    result: { config: ReleaseLifecycleConfig } | { error: string }
  ) => {
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setDraft(result.config);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-[14px] text-slate-500 dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white/50">
        Loading your release lifecycle configuration…
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="release-lifecycle-settings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/12 text-brand-700 dark:text-brand-300">
            <GitBranch className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">
              Release Lifecycle
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500 dark:text-white/50">
              Configure statuses, allowed transitions, and fixed-catalog gates for your own
              release workflow. Changes never affect another user&apos;s config.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing ? (
            <button
              type="button"
              className={cn(taBtnPrimary, "gap-1.5")}
              onClick={beginEdit}
              data-testid="lifecycle-settings-edit"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          ) : (
            <>
              <button
                type="button"
                className={cn(taBtnSecondary, "gap-1.5")}
                onClick={cancelEdit}
                disabled={saving}
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                type="button"
                className={cn(taBtnPrimary, "gap-1.5")}
                onClick={() => void save()}
                disabled={saving}
                data-testid="lifecycle-settings-save"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {warning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {warning}
        </div>
      ) : null}
      {error ? (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
          data-testid="lifecycle-settings-error"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["statuses", "Statuses"],
            ["transitions", "Transitions"],
            ["gates", "Gates"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={activePanel === id}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              activePanel === id
                ? "bg-brand-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15"
            )}
            onClick={() => setActivePanel(id)}
            data-testid={`lifecycle-panel-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>

      {activePanel === "statuses" ? (
        <SectionCard
          step="1"
          title="Statuses"
          subtitle="Use the On/Off switch for defaults (don’t delete them). Drag the ⋮⋮ handle beside the switch to rearrange — that order drives the release detail timeline. Custom statuses can be removed only when unused."
          help={LIFECYCLE_TAB_HELP.statuses}
        >
          <StatusesPanel
            config={draft}
            usage={usage}
            editing={editing}
            newLabel={newLabel}
            newTerminal={newTerminal}
            onNewLabelChange={setNewLabel}
            onNewTerminalChange={setNewTerminal}
            onAdd={() => {
              applyResult(addLifecycleStatus(draft, newLabel, newTerminal));
              setNewLabel("");
              setNewTerminal(false);
            }}
            onRemove={(key) => {
              applyResult(removeLifecycleStatus(draft, key, usage[key] ?? 0));
            }}
            onToggleEnabled={(key, enabled) => {
              applyResult(toggleLifecycleStatus(draft, key, enabled));
            }}
            onReorder={(orderedKeys) => {
              applyResult(reorderLifecycleStatuses(draft, orderedKeys));
            }}
          />
        </SectionCard>
      ) : null}

      {activePanel === "transitions" ? (
        <SectionCard
          step="2"
          title="Transitions"
          subtitle="Allowed moves between statuses. On = available as a next step. Required = gates hard-block (no override). Custom edges can be removed; defaults use Off instead."
          help={LIFECYCLE_TAB_HELP.transitions}
        >
          <TransitionsPanel
            config={draft}
            editing={editing}
            selectedKey={selectedRowKey}
            onSelect={(fromKey, targetKey) => {
              setSelectedFromKey(fromKey);
              setSelectedTargetKey(targetKey);
              setActivePanel("gates");
            }}
            onToggleEnabled={(fromKey, targetKey, enabled) => {
              applyResult(toggleLifecycleTransition(draft, fromKey, targetKey, enabled));
            }}
            onToggleEnforcement={(fromKey, targetKey, required) => {
              const result = setLifecycleTransitionEnforcement(
                draft,
                fromKey,
                targetKey,
                required ? "required" : "flexible"
              );
              if ("error" in result) {
                setError(result.error);
                return;
              }
              setError(null);
              setDraft(result.config);
              setEnforcementWarning(result.warning);
            }}
            onRemove={(fromKey, targetKey) => {
              applyResult(removeLifecycleTransition(draft, fromKey, targetKey));
              if (
                selectedFromKey === fromKey &&
                selectedTargetKey === targetKey
              ) {
                setSelectedFromKey(null);
                setSelectedTargetKey(null);
              }
            }}
            addFrom={addFrom}
            addTo={addTo}
            onAddFromChange={setAddFrom}
            onAddToChange={setAddTo}
            onAdd={() => {
              applyResult(addLifecycleTransition(draft, addFrom, addTo));
              setAddFrom("");
              setAddTo("");
            }}
            enforcementWarning={enforcementWarning}
          />
        </SectionCard>
      ) : null}

      {activePanel === "gates" ? (
        <SectionCard
          step="3"
          title="Gates"
          subtitle="Attach gates from the fixed catalog only. Unreliable deploy gates are labeled so they cannot be mistaken for real protection."
          help={LIFECYCLE_TAB_HELP.gates}
        >
          <GatesPanel
            config={draft}
            editing={editing}
            selectedFromKey={selectedFromKey}
            selectedTargetKey={selectedTargetKey}
            onToggleGate={(
              fromKey: string,
              targetKey: string,
              gateType: ReleaseLifecycleGateType,
              enabled: boolean
            ) => {
              applyResult(toggleLifecycleGate(draft, fromKey, targetKey, gateType, enabled));
            }}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
