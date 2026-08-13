"use client";

/**
 * Settings → Release Lifecycle — per-user statuses, transitions, and fixed-catalog gates.
 * Matches the Risk Engine settings pattern: section cards, Edit / Save / Cancel per page.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  setLifecycleStatusEditMode,
  setLifecycleStatusRoles,
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
import {
  FieldLocksPanel,
  type FieldLockMatrixRow,
  type FieldLockStatusCol,
} from "@/components/settings/lifecycle/FieldLocksPanel";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import type { FormAlert } from "@/lib/form-save-alert";
import type { FieldLockState } from "@/lib/release-field-lock-catalog";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";

type PanelId = "statuses" | "transitions" | "gates" | "fieldLocks";

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
      "Edit rule controls how much of the release can still be changed in that stage (editable, limited, view-only, or no further edits). Field Locks can still lock individual fields.",
      "“What this status does” tells automations the meaning of the stage (starting status, Ready/Deploying/Deployed milestones, withdraw approvals) so renaming the label does not break checks.",
      "Only unused custom statuses can be removed.",
    ],
  },
  transitions: {
    title: "Quick help · Transitions",
    points: [
      "A transition is an allowed move from one stage to another (for example UAT → Pending CAB).",
      "On = people can pick this move. Off = the move is hidden.",
      "Flexible = if a check fails, you can still proceed with a written reason.",
      "Required = if a check fails, the move is blocked — no exception.",
      "Moves out of Deploying and Deployed are always required — that control is not a toggle.",
      "“1 check” means 1 homework check is attached. Click the row (or open the Checks tab) to manage checks.",
    ],
  },
  gates: {
    title: "Quick help · Checks",
    points: [
      "Every allowed move is listed here — click a row (e.g. Draft → Planning) to open its checks.",
      "Checks are homework requirements on that move (booking exists, owner set, no blockers…).",
      "Turn Attached on to add a check — it moves into Active and leaves Available for that move.",
      "Hard block vs exception is set on Transitions (Required vs Flexible).",
    ],
  },
  fieldLocks: {
    title: "Quick help · Field Locks",
    points: [
      "Ask: “When a release is in this status, can people still change this field?”",
      "Can edit = allowed. Locked = blocked (they’ll see an error if they try).",
      "Can edit → back to Pending CAB = allowed, but the release is sent back to Pending CAB (typical for Size/Priority after CAB approval).",
      "Status itself is not controlled here — use Transitions for that.",
      "“Coming later” rows are in the rules spreadsheet but not built in the product yet.",
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
  const [alert, setAlert] = useState<FormAlert | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [enforcementWarning, setEnforcementWarning] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelId>("statuses");
  const [newLabel, setNewLabel] = useState("");
  const [newTerminal, setNewTerminal] = useState(false);
  const [addFrom, setAddFrom] = useState("");
  const [addTo, setAddTo] = useState("");
  const [selectedFromKey, setSelectedFromKey] = useState<string | null>(null);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);
  const [fieldLockStatuses, setFieldLockStatuses] = useState<FieldLockStatusCol[]>(
    []
  );
  const [fieldLockRows, setFieldLockRows] = useState<FieldLockMatrixRow[]>([]);
  const [fieldLockGapRows, setFieldLockGapRows] = useState<FieldLockMatrixRow[]>(
    []
  );
  const [fieldLockOrphans, setFieldLockOrphans] = useState<string[]>([]);
  const [fieldLockBaseline, setFieldLockBaseline] = useState<FieldLockMatrixRow[]>(
    []
  );
  const fieldLockRowsRef = useRef(fieldLockRows);
  fieldLockRowsRef.current = fieldLockRows;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const selectedRowKey = useMemo(() => {
    if (!selectedFromKey || !selectedTargetKey) return null;
    return `${selectedFromKey}:${selectedTargetKey}`;
  }, [selectedFromKey, selectedTargetKey]);

  const showAlert = useCallback((message: string, title = "Could not update lifecycle") => {
    setAlert({ title, message });
  }, []);

  const applyFieldLockPayload = useCallback(
    (payload: {
      rows: Array<{
        fieldKey: string;
        category: string;
        lockRuleRef: string | null;
        isConfigurable: boolean;
        statusRules: Record<string, FieldLockState>;
      }>;
      statuses: FieldLockStatusCol[];
      orphanStatusKeys: string[];
      catalog: Array<{
        fieldKey: string;
        label: string;
        category: string;
        lockRuleRef: string | null;
        isConfigurable: boolean;
        infoOnly?: boolean;
        unavailable?: boolean;
      }>;
      gapRows: Array<{
        fieldKey: string;
        label: string;
        category: string;
        lockRuleRef: string | null;
        isConfigurable: boolean;
        infoOnly?: boolean;
        unavailable?: boolean;
      }>;
    }) => {
      const labelByKey = new Map(payload.catalog.map((c) => [c.fieldKey, c]));
      const matrixRows: FieldLockMatrixRow[] = payload.rows.map((row) => {
        const meta = labelByKey.get(row.fieldKey);
        return {
          fieldKey: row.fieldKey,
          label: meta?.label ?? row.fieldKey,
          category: row.category,
          lockRuleRef: row.lockRuleRef,
          isConfigurable: row.isConfigurable,
          infoOnly: Boolean(meta?.infoOnly),
          unavailable: false,
          statusRules: row.statusRules,
        };
      });
      const gaps: FieldLockMatrixRow[] = payload.gapRows.map((g) => ({
        fieldKey: g.fieldKey,
        label: g.label,
        category: g.category,
        lockRuleRef: g.lockRuleRef,
        isConfigurable: false,
        infoOnly: false,
        unavailable: true,
        statusRules: {},
      }));
      setFieldLockStatuses(payload.statuses);
      setFieldLockRows(matrixRows);
      setFieldLockBaseline(matrixRows.map((r) => ({ ...r, statusRules: { ...r.statusRules } })));
      setFieldLockGapRows(gaps);
      setFieldLockOrphans(payload.orphanStatusKeys);
    },
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setAlert(null);
    try {
      const [configRes, usageRes, fieldLockRes] = await Promise.all([
        fetch("/api/release-lifecycle-config", { credentials: "same-origin" }),
        fetch("/api/release-lifecycle-config/status-usage", {
          credentials: "same-origin",
        }),
        fetch("/api/release-field-lock-config", { credentials: "same-origin" }),
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

      if (fieldLockRes.ok) {
        const flBody = (await fieldLockRes.json()) as Parameters<
          typeof applyFieldLockPayload
        >[0];
        applyFieldLockPayload(flBody);
      }
    } catch (loadError) {
      showAlert(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load lifecycle config",
        "Could not load lifecycle"
      );
    } finally {
      setLoading(false);
    }
  }, [showAlert, applyFieldLockPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  const beginEdit = () => {
    setDraft(cloneLifecycleConfig(baseline));
    setFieldLockRows(
      fieldLockBaseline.map((r) => ({
        ...r,
        statusRules: { ...r.statusRules },
      }))
    );
    setEditing(true);
    setAlert(null);
    setEnforcementWarning(null);
  };

  const cancelEdit = () => {
    setDraft(cloneLifecycleConfig(baseline));
    setFieldLockRows(
      fieldLockBaseline.map((r) => ({
        ...r,
        statusRules: { ...r.statusRules },
      }))
    );
    setEditing(false);
    setAlert(null);
    setEnforcementWarning(null);
    setNewLabel("");
    setNewTerminal(false);
  };

  const save = async () => {
    const validationError = validateReleaseLifecycleConfig(draft);
    if (validationError) {
      showAlert(validationError, "Could not save lifecycle");
      return;
    }
    setSaving(true);
    setAlert(null);
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
      // Keep the draft we just saved (includes Off toggles). Then re-load so
      // reconcile cannot silently present a different On/Off set after Save.
      const saved = cloneLifecycleConfig(draftRef.current);
      setBaseline(saved);
      setDraft(cloneLifecycleConfig(saved));
      const reload = await fetch("/api/release-lifecycle-config", {
        credentials: "same-origin",
      });
      if (reload.ok) {
        const reloadBody = (await reload.json()) as {
          config?: ReleaseLifecycleConfig;
          warning?: { message?: string };
        };
        if (reloadBody.config) {
          const reloaded = cloneLifecycleConfig(reloadBody.config);
          setBaseline(reloaded);
          setDraft(cloneLifecycleConfig(reloaded));
        }
        if (reloadBody.warning?.message) setWarning(reloadBody.warning.message);
      }

      const lockRes = await fetch("/api/release-field-lock-config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: fieldLockRowsRef.current
            .filter((r) => r.isConfigurable && !r.infoOnly && !r.unavailable)
            .map((r) => ({
              fieldKey: r.fieldKey,
              statusRules: r.statusRules,
            })),
        }),
      });
      const lockBody = (await lockRes.json().catch(() => null)) as {
        error?: string;
        rows?: Parameters<typeof applyFieldLockPayload>[0]["rows"];
        statuses?: FieldLockStatusCol[];
        orphanStatusKeys?: string[];
      } | null;
      if (!lockRes.ok) {
        throw new Error(lockBody?.error ?? "Field lock save failed");
      }
      // Reload field locks so catalog/gap meta stays aligned after status renames.
      const flReload = await fetch("/api/release-field-lock-config", {
        credentials: "same-origin",
      });
      if (flReload.ok) {
        applyFieldLockPayload(
          (await flReload.json()) as Parameters<typeof applyFieldLockPayload>[0]
        );
      }

      setEditing(false);
      setEnforcementWarning(null);
      const usageRes = await fetch("/api/release-lifecycle-config/status-usage", {
        credentials: "same-origin",
      });
      if (usageRes.ok) {
        const usageBody = (await usageRes.json()) as { usage?: StatusUsageMap };
        setUsage(usageBody.usage ?? {});
      }
    } catch (saveError) {
      showAlert(
        saveError instanceof Error ? saveError.message : "Save failed",
        "Could not save lifecycle"
      );
    } finally {
      setSaving(false);
    }
  };

  const applyResult = (
    result: { config: ReleaseLifecycleConfig } | { error: string },
    errorTitle = "Could not update lifecycle"
  ) => {
    if ("error" in result) {
      showAlert(result.error, errorTitle);
      return;
    }
    setAlert(null);
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
              Configure statuses, allowed transitions, and fixed-catalog checks for your own
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

      <FormAlertDialog alert={alert} onDismiss={() => setAlert(null)} />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["statuses", "Statuses"],
            ["transitions", "Transitions"],
            ["gates", "Checks"],
            ["fieldLocks", "Field Locks"],
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
          subtitle="Use the On/Off switch for defaults (don’t delete them). Each status also has an edit rule you can change. Drag the ⋮⋮ handle beside the switch to rearrange — that order drives the release detail timeline. Custom statuses can be removed only when unused."
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
              applyResult(
                addLifecycleStatus(draftRef.current, newLabel, newTerminal),
                "Could not add status"
              );
              setNewLabel("");
              setNewTerminal(false);
            }}
            onRemove={(key) => {
              applyResult(
                removeLifecycleStatus(draftRef.current, key, usage[key] ?? 0),
                "Could not remove status"
              );
            }}
            onToggleEnabled={(key, enabled) => {
              applyResult(
                toggleLifecycleStatus(draftRef.current, key, enabled),
                "Could not update status"
              );
            }}
            onEditModeChange={(key, editMode) => {
              applyResult(
                setLifecycleStatusEditMode(draftRef.current, key, editMode),
                "Could not update edit rule"
              );
            }}
            onReorder={(orderedKeys) => {
              applyResult(
                reorderLifecycleStatuses(draftRef.current, orderedKeys),
                "Could not reorder statuses"
              );
            }}
            onRoleToggle={(key, id, checked) => {
              applyResult(
                setLifecycleStatusRoles(draftRef.current, key, { [id]: checked }),
                "Could not update what this status does"
              );
            }}
          />
        </SectionCard>
      ) : null}

      {activePanel === "transitions" ? (
        <SectionCard
          step="2"
          title="Transitions"
          subtitle="Allowed moves between statuses. On = available as a next step. Required = checks must pass (no exception). Moves out of Deploying and Deployed stay required. Custom edges can be removed; defaults use Off instead."
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
              applyResult(
                toggleLifecycleTransition(draftRef.current, fromKey, targetKey, enabled),
                "Could not update transition"
              );
            }}
            onToggleEnforcement={(fromKey, targetKey, required) => {
              const result = setLifecycleTransitionEnforcement(
                draftRef.current,
                fromKey,
                targetKey,
                required ? "required" : "flexible"
              );
              if ("error" in result) {
                showAlert(result.error, "Could not update transition");
                return;
              }
              setAlert(null);
              setDraft(result.config);
              setEnforcementWarning(result.warning);
            }}
            onRemove={(fromKey, targetKey) => {
              applyResult(
                removeLifecycleTransition(draftRef.current, fromKey, targetKey),
                "Could not remove transition"
              );
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
              applyResult(
                addLifecycleTransition(draftRef.current, addFrom, addTo),
                "Could not add transition"
              );
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
          title="Checks"
          subtitle="Browse every transition and expand a row to attach checks. Unreliable deploy checks are labeled so they cannot be mistaken for real protection."
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
              // Always toggle against the latest draft so attached checks leave Available immediately.
              applyResult(
                toggleLifecycleGate(
                  draftRef.current,
                  fromKey,
                  targetKey,
                  gateType,
                  enabled
                ),
                enabled ? "Could not attach check" : "Could not detach check"
              );
            }}
          />
        </SectionCard>
      ) : null}

      {activePanel === "fieldLocks" ? (
        <SectionCard
          step="4"
          title="Field Locks"
          subtitle="Decide which release fields people can change in each status. Click Edit to change the dropdowns, then Save."
          help={LIFECYCLE_TAB_HELP.fieldLocks}
        >
          <FieldLocksPanel
            statuses={fieldLockStatuses}
            rows={fieldLockRows}
            gapRows={fieldLockGapRows}
            orphanStatusKeys={fieldLockOrphans}
            editing={editing}
            onCellChange={(fieldKey, statusKey, state) => {
              setFieldLockRows((prev) =>
                prev.map((row) =>
                  row.fieldKey === fieldKey
                    ? {
                        ...row,
                        statusRules: { ...row.statusRules, [statusKey]: state },
                      }
                    : row
                )
              );
            }}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
