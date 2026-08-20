"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, GitBranch, List, Package } from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  EditableField,
  EditableFieldGrid,
  StatusChip,
  TintedCallout,
  EntityConnection,
  type ChipTone,
} from "@/components/detail/editable";
import { DetailDecisionHeader } from "@/components/detail/decision";
import { LifecycleExceptionConfirm } from "@/components/detail/LifecycleExceptionConfirm";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { useLifecycleStatusConfirm } from "@/hooks/useLifecycleStatusConfirm";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  DEPENDENCY_IMPACTS,
  DEPENDENCY_TYPES,
} from "@/lib/validation/dependency";
import {
  chipToneToFactTone,
  collectAttention,
  type DetailAction,
  type DetailFact,
} from "@/lib/detail-decision";
import { dependencyWorkflow, type WorkflowStep } from "@/lib/entity-workflow";
import { useEntityLifecycleStatuses } from "@/hooks/useEntityLifecycleStatuses";
import { statusSelectOptions } from "@/lib/entity-lifecycle-status-ui";
import type { DependencyLifecycleConfig } from "@/lib/dependency-lifecycle-config";
import {
  bothDependencyPartiesAcknowledged,
  isDependencySideAcknowledged,
  type DependencyAckSide,
} from "@/lib/dependency-ack";

type ReleaseOwner = { id: string; name: string; email: string };

type ReleaseRef = {
  id: string;
  releaseCode: string;
  name: string;
  status: string;
  releaseOwnerId?: string | null;
  releaseOwner?: ReleaseOwner | null;
};

type DependencyDetail = {
  id: string;
  depCode: string;
  dependencyType: string;
  status: string;
  impactIfBlocked: string;
  notes: string | null;
  sourceAcknowledgedAt: string | Date | null;
  sourceAcknowledgedByUserId: string | null;
  targetAcknowledgedAt: string | Date | null;
  targetAcknowledgedByUserId: string | null;
  release: ReleaseRef;
  dependsOnRelease: ReleaseRef;
};

type DependencyOption = { id: string; depCode: string };
type ReleaseOption = { id: string; releaseCode: string; name: string };

type DependencyDraft = {
  releaseId: string;
  dependsOnReleaseId: string;
  dependencyType: string;
  status: string;
  impactIfBlocked: string;
  notes: string;
};

const DEPENDENCY_FIELD_LABELS: Partial<Record<keyof DependencyDraft, string>> = {
  releaseId: "Source Release",
  dependsOnReleaseId: "Depends On (Upstream)",
  dependencyType: "Dependency Type",
  status: "Status",
  impactIfBlocked: "Impact if Blocked",
  notes: "Notes",
};

const TYPE_OPTIONS = DEPENDENCY_TYPES.map((v) => ({ value: v, label: v }));
const IMPACT_OPTIONS = DEPENDENCY_IMPACTS.map((v) => ({ value: v, label: v }));

function statusTone(status: string): ChipTone {
  const s = status.toLowerCase();
  if (s.includes("block") || s === "escalated") return "bad";
  if (
    s.includes("risk") ||
    s === "pending" ||
    s === "identified" ||
    s === "confirmed"
  ) {
    return "warn";
  }
  if (
    s.includes("resolv") ||
    s.includes("remov") ||
    s.includes("closed") ||
    s.includes("clear") ||
    s.includes("met") ||
    s.includes("waiv")
  ) {
    return "good";
  }
  return "neutral";
}

function impactTone(impact: string): ChipTone {
  const s = impact.toLowerCase();
  if (s.includes("integrity") || s.includes("failure") || s.includes("critical")) return "bad";
  if (s.includes("delay") || s.includes("partial") || s.includes("scope")) return "warn";
  return "neutral";
}

function withCurrentOption(
  options: { value: string; label: string }[],
  current: string | undefined
) {
  if (!current) return options;
  if (options.some((o) => o.value === current)) return options;
  return [{ value: current, label: current }, ...options];
}

function formatAckAt(value: string | Date | null | undefined): string {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString();
}

function toDraft(row: DependencyDetail): DependencyDraft {
  return {
    releaseId: row.release.id,
    dependsOnReleaseId: row.dependsOnRelease.id,
    dependencyType: row.dependencyType,
    status: row.status,
    impactIfBlocked: row.impactIfBlocked,
    notes: row.notes ?? "",
  };
}

function AckSideCard(props: {
  title: string;
  releaseCode: string;
  ownerName: string | null;
  acknowledged: boolean;
  acknowledgedAt: string;
  busy: boolean;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--card)]">
      <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
        {props.title}
      </p>
      <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/55">
        {props.releaseCode}
        {props.ownerName ? ` · ${props.ownerName}` : " · no owner assigned"}
      </p>
      {props.acknowledged ? (
        <p className="mt-3 text-[13px] text-emerald-700 dark:text-emerald-300">
          Confirmed{props.acknowledgedAt ? ` · ${props.acknowledgedAt}` : ""}
        </p>
      ) : (
        <button
          type="button"
          className={cn(taBtnSecondary, "mt-3 text-sm !py-2")}
          disabled={props.disabled}
          onClick={props.onConfirm}
        >
          {props.busy ? "Recording…" : "Record confirmation"}
        </button>
      )}
    </div>
  );
}

export default function DependencyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const lifecycle = useEntityLifecycleStatuses("/api/dependency-lifecycle-config");
  const [row, setRow] = useState<DependencyDetail | null>(null);
  const [options, setOptions] = useState<DependencyOption[]>([]);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  /** Id of the workflow step currently being written, so its button can spin. */
  const [pendingStep, setPendingStep] = useState<string | null>(null);
  const [ackBusy, setAckBusy] = useState<DependencyAckSide | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, releaseList, me] = await Promise.all([
      safeFetchJson<DependencyDetail>(`/api/dependencies/${id}`, {
        signal,
        label: "dependency-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<DependencyOption[]>("/api/dependencies", {
        signal,
        label: "dependencies-list",
      }),
      safeFetchJson<ReleaseOption[]>("/api/releases", {
        signal,
        label: "dependency-releases",
      }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(list.ok ? list.data.map((d) => ({ id: d.id, depCode: d.depCode })) : []);
    setReleases(
      releaseList.ok
        ? releaseList.data
            .map((r) => ({ id: r.id, releaseCode: r.releaseCode, name: r.name }))
            .sort((a, b) => a.releaseCode.localeCompare(b.releaseCode))
        : []
    );
    if (me.ok) setUser(me.data.user);
    setLastRefresh(new Date());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const source = useMemo(() => (row ? toDraft(row) : null), [row]);
  const edit = useEditableDetail(source);
  const canEdit = sessionCanEdit(user);
  const v = edit.values;
  const d = edit.draft;
  /** True when exception panel was opened from modal save (retry should completeSaveSuccess). */
  const exceptionFromModalSave = useRef(false);
  const statusConfirm = useLifecycleStatusConfirm({
    entityLabel: "dependency",
    onSuccess: async () => {
      if (exceptionFromModalSave.current) {
        exceptionFromModalSave.current = false;
        if (edit.editing) {
          edit.completeSaveSuccess(DEPENDENCY_FIELD_LABELS);
        }
      }
      await load();
    },
  });

  const selectOptions = useMemo(
    () =>
      [...options]
        .filter((o) => o.depCode)
        .sort((a, b) => a.depCode.localeCompare(b.depCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.depCode })),
    [options]
  );

  const releaseSelectOptions = useMemo(
    () =>
      releases.map((r) => ({
        value: r.id,
        label: `${r.releaseCode} — ${r.name}`,
      })),
    [releases]
  );

  const typeOptions = useMemo(
    () => withCurrentOption(TYPE_OPTIONS, row?.dependencyType),
    [row?.dependencyType]
  );
  const statusOptions = useMemo(
    () => statusSelectOptions(lifecycle.createOptions, row?.status),
    [lifecycle.createOptions, row?.status]
  );
  const impactOptions = useMemo(
    () => withCurrentOption(IMPACT_OPTIONS, row?.impactIfBlocked),
    [row?.impactIfBlocked]
  );

  const save = async () => {
    if (!row || !edit.draft) return;
    if (edit.draft.releaseId === edit.draft.dependsOnReleaseId) {
      edit.setError("A release cannot depend on itself.");
      return;
    }
    edit.setSaving(true);
    edit.setError(null);
    const draft = edit.draft;
    const patchBody = {
      releaseId: draft.releaseId,
      dependsOnReleaseId: draft.dependsOnReleaseId,
      dependencyType: draft.dependencyType,
      status: draft.status,
      impactIfBlocked: draft.impactIfBlocked,
      notes: draft.notes.trim() ? draft.notes.trim() : null,
    };
    const res = await safeFetchJson(`/api/dependencies/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
      label: "dependency-patch",
      rejectHttpErrors: false,
    });
    if (!res.ok || (res.status ?? 0) >= 300) {
      const data =
        res.ok && res.data && typeof res.data === "object"
          ? (res.data as {
              error?: string;
              code?: string;
              unmetReasons?: unknown;
            })
          : null;
      const apiError = typeof data?.error === "string" ? data.error : "";
      const code = typeof data?.code === "string" ? data.code : "";
      const unmetReasons = Array.isArray(data?.unmetReasons)
        ? data.unmetReasons.filter((r): r is string => typeof r === "string")
        : [];
      if (code === "TRANSITION_NEEDS_OVERRIDE" && draft.status !== row.status) {
        const { status: _status, ...extraBody } = patchBody;
        exceptionFromModalSave.current = true;
        statusConfirm.presentException({
          targetStatus: draft.status,
          targetLabel: draft.status,
          patchUrl: `/api/dependencies/${row.id}`,
          extraBody,
          unmetReasons,
          leadMessage: apiError || null,
        });
        edit.setSaving(false);
        return;
      }
      edit.setSaving(false);
      edit.setError(apiError || "Couldn’t save changes. Try again.");
      return;
    }
    edit.setSaving(false);
    edit.completeSaveSuccess(DEPENDENCY_FIELD_LABELS);
    await load();
  };

  /**
   * Apply a one-click status transition from the decision header.
   * Soft unmet checks open LifecycleExceptionConfirm via the shared hook.
   */
  const applyStep = async (step: WorkflowStep) => {
    if (!row) return;
    setPendingStep(step.id);
    await statusConfirm.requestStatusChange({
      targetStatus: step.status,
      targetLabel: step.label,
      patchUrl: `/api/dependencies/${row.id}`,
    });
    setPendingStep(null);
  };

  /**
   * Record one side of Confirmed dual-acknowledgment. The API checks the
   * caller is that release's directory owner — never trust the client.
   */
  const recordAcknowledgment = async (side: DependencyAckSide) => {
    if (!row) return;
    setAckBusy(side);
    setAckError(null);
    const res = await safeFetchJson(`/api/dependencies/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledgeSide: side }),
      label: "dependency-acknowledge",
      rejectHttpErrors: false,
    });
    setAckBusy(null);
    if (!res.ok || (res.status ?? 0) >= 300) {
      const data =
        res.ok && res.data && typeof res.data === "object"
          ? (res.data as { error?: string })
          : null;
      setAckError(
        typeof data?.error === "string"
          ? data.error
          : "Couldn’t record that confirmation. Try again."
      );
      return;
    }
    await load();
  };

  const remove = async () => {
    if (!row) return;
    edit.setDeleting(true);
    const res = await safeFetchJson(`/api/dependencies/${row.id}`, {
      method: "DELETE",
      label: "dependency-delete",
      rejectHttpErrors: false,
    });
    edit.setDeleting(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t delete this dependency.");
      edit.setDeleteOpen(false);
      return;
    }
    router.push("/dependencies");
  };

  if (loading) return <p className="text-slate-500 dark:text-white/60">Loading dependency…</p>;
  if (!row || !v) return <p className="text-slate-500 dark:text-white/60">Dependency not found.</p>;

  const code = row.depCode || row.id;
  const sourceRelease =
    releases.find((r) => r.id === v.releaseId) ??
    (v.releaseId === row.release.id ? row.release : null);
  const upstreamRelease =
    releases.find((r) => r.id === v.dependsOnReleaseId) ??
    (v.dependsOnReleaseId === row.dependsOnRelease.id ? row.dependsOnRelease : null);
  // Pending is a live lifecycle state (not cleared) — treat like blocked/at-risk for attention.
  const blockedish = /block|risk|pending/i.test(v.status);
  const workflow = dependencyWorkflow(
    v.status,
    (lifecycle.config as DependencyLifecycleConfig | null) ?? undefined
  );
  const bothAcked = bothDependencyPartiesAcknowledged(row);
  const sourceAcked = isDependencySideAcknowledged(row, "source");
  const targetAcked = isDependencySideAcknowledged(row, "target");
  const showAckSection =
    /confirmed/i.test(v.status) || sourceAcked || targetAcked;

  const toAction = (step: WorkflowStep): DetailAction => ({
    id: step.id,
    label: step.label,
    write: true,
    pending: pendingStep === step.id,
    disabled: pendingStep !== null,
    onClick: () => void applyStep(step),
  });

  const attention = collectAttention([
    {
      id: "need-acks",
      when: /confirmed/i.test(v.status) && !bothAcked,
      tone: "warning",
      label: "Both release managers must confirm",
      detail: "Each owner records their own acknowledgment before work can start.",
    },
    {
      id: "blocked",
      when: /block/i.test(v.status),
      tone: "critical",
      label: `${sourceRelease?.releaseCode ?? "Source"} is blocked by ${upstreamRelease?.releaseCode ?? "upstream"}`,
      detail: "The dependent release cannot proceed until the upstream link clears.",
    },
    {
      id: "at-risk",
      when: /risk/i.test(v.status),
      tone: "warning",
      label: "Upstream link at risk",
      detail: "The upstream release may slip and take the dependent release with it.",
    },
    {
      id: "hard-and-blocked",
      when: blockedish && /hard/i.test(v.dependencyType),
      tone: "critical",
      label: "Hard dependency, not clear",
      detail: "A hard dependency has no workaround — the upstream release must land first.",
    },
    {
      id: "severe-impact",
      when: blockedish && impactTone(v.impactIfBlocked) === "bad",
      tone: "critical",
      label: v.impactIfBlocked,
      detail: "This is the consequence if the link stays blocked.",
    },
    {
      id: "no-notes",
      when: blockedish && !v.notes.trim(),
      tone: "warning",
      label: "No mitigation notes",
      detail: "Nothing is recorded about how the two teams plan to unblock this.",
    },
  ]);

  const signals: DetailFact[] = [
    {
      label: "Type",
      value: v.dependencyType || "—",
      tone: /hard/i.test(v.dependencyType) ? "bad" : "neutral",
      hint: "Hard dependencies must land first; soft ones have a workaround.",
    },
    {
      label: "If blocked",
      value: v.impactIfBlocked || "—",
      tone: chipToneToFactTone(impactTone(v.impactIfBlocked)),
      hint: "What happens to the dependent release if this link never clears.",
    },
  ];

  const scope: DetailFact[] = [
    {
      label: "Waiting release",
      value: sourceRelease?.releaseCode ?? "—",
      href: sourceRelease ? `/releases/${sourceRelease.id}` : undefined,
      hint: sourceRelease?.name,
    },
    {
      label: "Upstream release",
      value: upstreamRelease?.releaseCode ?? "—",
      href: upstreamRelease ? `/releases/${upstreamRelease.id}` : undefined,
      hint: upstreamRelease?.name,
    },
  ];

  return (
    <EditableDetailShell
      pageTitle="Dependency Detail"
      pageDescription="Inter-release link that can block delivery — if the upstream release slips, impact-if-blocked spells out delay, integrity, or scope risk for the dependent."
      entityLabel="Dependency"
      entityCode={code}
      entityName={`${sourceRelease?.releaseCode ?? "—"} → ${upstreamRelease?.releaseCode ?? "—"}`}
      selectLabel="Select Dependency"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: code }]}
      onSelectChange={(next) => next !== row.id && router.push(`/dependencies/${next}`)}
      lastRefresh={lastRefresh}
      footer="Dependency Page v2.0 · Inter-release links · Dependency ID is locked"
      editing={edit.editing}
      canEdit={canEdit}
      saving={edit.saving}
      deleting={edit.deleting}
      editError={edit.error}
      onClearEditError={() => edit.setError(null)}
      onEdit={edit.startEdit}
      onDiscard={edit.discard}
      onSave={save}
      deleteOpen={edit.deleteOpen}
      onDeleteOpen={() => edit.setDeleteOpen(true)}
      onDeleteCancel={() => edit.setDeleteOpen(false)}
      onDeleteConfirm={remove}
      lockedIdLabel="Dep ID"
      successChanges={edit.successChanges}
      onSuccessDismiss={edit.dismissSuccess}
      editForm={
        d ? (
          <EditableFieldGrid cols={2}>
            <EditableField
              label="Source Release"
              value={d.releaseId}
              editing
              kind="select"
              options={releaseSelectOptions}
              onChange={(n) => edit.setField("releaseId", n)}
            />
            <EditableField
              label="Depends On (Upstream)"
              value={d.dependsOnReleaseId}
              editing
              kind="select"
              options={releaseSelectOptions}
              onChange={(n) => edit.setField("dependsOnReleaseId", n)}
            />
            <EditableField
              label="Dependency Type"
              value={d.dependencyType}
              editing
              kind="select"
              options={typeOptions}
              onChange={(n) => edit.setField("dependencyType", n)}
              display={<StatusChip label={d.dependencyType} tone="neutral" />}
            />
            <EditableField
              label="Status"
              value={d.status}
              editing
              kind="select"
              options={statusOptions}
              onChange={(n) => edit.setField("status", n)}
              display={<StatusChip label={d.status} tone={statusTone(d.status)} />}
            />
            <EditableField
              label="Impact if Blocked"
              value={d.impactIfBlocked}
              editing
              kind="select"
              options={impactOptions}
              onChange={(n) => edit.setField("impactIfBlocked", n)}
              display={<StatusChip label={d.impactIfBlocked} tone={impactTone(d.impactIfBlocked)} />}
            />
            <EditableField
              label="Notes"
              value={d.notes}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("notes", n)}
              placeholder="Impact context, mitigation, owners…"
              className="sm:col-span-2"
            />
          </EditableFieldGrid>
        ) : null
      }
      relatedLinks={
        <>
          {sourceRelease && (
            <ProgressLink
              href={`/releases/${sourceRelease.id}`}
              className={taBtnSecondary + " text-sm !py-2"}
            >
              <Package className="mr-1.5 inline h-4 w-4" aria-hidden />
              Source Release
            </ProgressLink>
          )}
          {upstreamRelease && (
            <ProgressLink
              href={`/releases/${upstreamRelease.id}`}
              className={taBtnSecondary + " text-sm !py-2"}
            >
              <Package className="mr-1.5 inline h-4 w-4" aria-hidden />
              Upstream Release
            </ProgressLink>
          )}
          <ProgressLink href="/dependencies" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            All Dependencies
          </ProgressLink>
        </>
      }
    >
      <DetailDecisionHeader
        status={{
          label: v.status,
          tone: statusTone(v.status),
          caption: `${sourceRelease?.releaseCode ?? "—"} waits on ${upstreamRelease?.releaseCode ?? "—"}`,
        }}
        signals={signals}
        primaryAction={workflow.primary ? toAction(workflow.primary) : null}
        secondaryActions={workflow.secondary.map(toAction)}
        canEdit={canEdit}
        actionError={null}
        attention={attention}
        attentionClearLabel="This link is clear — the upstream release is not holding anything up"
        timing={[]}
        scope={scope}
      />

      {statusConfirm.pending ? (
        <div className="mt-4">
          <LifecycleExceptionConfirm
            targetLabel={statusConfirm.pending.targetLabel}
            needsException={statusConfirm.pending.needsException}
            blocked={statusConfirm.pending.blocked}
            exceptionReason={statusConfirm.exceptionReason}
            onExceptionReasonChange={statusConfirm.setExceptionReason}
            busy={statusConfirm.busy}
            confirmDisabled={statusConfirm.confirmDisabled}
            onCancel={statusConfirm.cancel}
            onConfirm={() => void statusConfirm.confirm()}
            checks={statusConfirm.pending.checks}
            leadMessage={statusConfirm.pending.leadMessage}
          />
        </div>
      ) : null}
      <FormAlertDialog alert={statusConfirm.alert} onDismiss={statusConfirm.dismissAlert} />

      <DetailSection
        icon={GitBranch}
        tone="indigo"
        title="Dependency flow"
        description="Source release waits on the upstream release named on the right."
      >
        <EntityConnection
          source={
            sourceRelease ? (
              <ProgressLink
                href={`/releases/${sourceRelease.id}`}
                className="text-indigo-600 hover:underline dark:text-indigo-300"
              >
                {sourceRelease.releaseCode}
              </ProgressLink>
            ) : (
              "—"
            )
          }
          target={
            upstreamRelease ? (
              <ProgressLink
                href={`/releases/${upstreamRelease.id}`}
                className="text-sky-600 hover:underline dark:text-sky-300"
              >
                {upstreamRelease.releaseCode}
              </ProgressLink>
            ) : (
              "—"
            )
          }
          caption={`${sourceRelease?.name ?? "Source"} depends on ${upstreamRelease?.name ?? "upstream"} · ${v.dependencyType} dependency`}
        />
      </DetailSection>

      {showAckSection ? (
        <DetailSection
          icon={CheckCircle2}
          tone="sky"
          title="Manager confirmations"
          description="Confirmed → In Progress needs both release managers. Each side is recorded separately."
        >
          {ackError ? (
            <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {ackError}
            </p>
          ) : null}
          {bothAcked ? (
            <TintedCallout tone="emerald">
              Both managers have confirmed. This dependency can move to In Progress.
            </TintedCallout>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <AckSideCard
              title="This release"
              releaseCode={row.release.releaseCode}
              ownerName={row.release.releaseOwner?.name ?? null}
              acknowledged={sourceAcked}
              acknowledgedAt={formatAckAt(row.sourceAcknowledgedAt)}
              busy={ackBusy === "source"}
              disabled={!canEdit || ackBusy !== null || sourceAcked}
              onConfirm={() => void recordAcknowledgment("source")}
            />
            <AckSideCard
              title="Upstream release"
              releaseCode={row.dependsOnRelease.releaseCode}
              ownerName={row.dependsOnRelease.releaseOwner?.name ?? null}
              acknowledged={targetAcked}
              acknowledgedAt={formatAckAt(row.targetAcknowledgedAt)}
              busy={ackBusy === "target"}
              disabled={!canEdit || ackBusy !== null || targetAcked}
              onConfirm={() => void recordAcknowledgment("target")}
            />
          </div>
        </DetailSection>
      ) : null}

      <DetailSection
        icon={FileText}
        tone="amber"
        title="Notes"
        description="Context for owners and CAB when this link threatens delivery."
      >
        <TintedCallout tone="amber">
          {v.notes.trim() ? v.notes : "No notes recorded yet."}
        </TintedCallout>
      </DetailSection>
    </EditableDetailShell>
  );
}
