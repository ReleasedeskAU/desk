"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, FileText, List, Package } from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  EditableField,
  EditableFieldGrid,
  EmptyHint,
  EntityTimeline,
  EntityConnection,
  type ChipTone,
} from "@/components/detail/editable";
import { DetailDecisionHeader } from "@/components/detail/decision";
import { LifecycleExceptionConfirm } from "@/components/detail/LifecycleExceptionConfirm";
import { LifecycleExceptionModal } from "@/components/detail/LifecycleExceptionModal";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { useLifecycleStatusConfirm } from "@/hooks/useLifecycleStatusConfirm";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";
import {
  chipToneToFactTone,
  collectAttention,
  type DetailAction,
  type DetailFact,
} from "@/lib/detail-decision";
import { incidentWorkflow, type WorkflowStep } from "@/lib/entity-workflow";
import { useEntityLifecycleStatuses } from "@/hooks/useEntityLifecycleStatuses";
import { statusSelectOptions } from "@/lib/entity-lifecycle-status-ui";
import type { IncidentLifecycleConfig } from "@/lib/incident-lifecycle-config";

type IncidentDetail = {
  id: string;
  incidentCode: string;
  timestamp: string;
  applicationId: string;
  departmentName: string | null;
  severity: string;
  title: string;
  status: string;
  impact: string;
  assignedTo: string | null;
  relatedReleaseCode: string | null;
  environmentName: string;
  application: { id: string; name: string };
  relatedRelease: { id: string; releaseCode: string; name: string; status: string } | null;
};

type IncidentOption = { id: string; incidentCode: string };
type ApplicationOption = { id: string; name: string };
type ReleaseOption = { releaseCode: string };

type IncidentDraft = {
  timestamp: string;
  applicationId: string;
  departmentName: string;
  severity: string;
  title: string;
  status: string;
  impact: string;
  assignedTo: string;
  relatedReleaseCode: string;
  environmentName: string;
};

const INCIDENT_FIELD_LABELS: Partial<Record<keyof IncidentDraft, string>> = {
  timestamp: "Created",
  applicationId: "Application",
  departmentName: "Department",
  severity: "Severity",
  title: "Title",
  status: "Status",
  impact: "Impact",
  assignedTo: "Assigned To",
  relatedReleaseCode: "Related Release",
  environmentName: "Environment",
};

const SEVERITY_OPTIONS = ["P1", "P2", "P3"].map((v) => ({ value: v, label: v }));


function toDateInput(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function nullIfEmpty(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

function severityTone(severity: string): ChipTone {
  const s = severity.toLowerCase();
  if (s.includes("p1") || s.includes("sev-1") || s.includes("critical")) return "bad";
  if (s.includes("p2") || s.includes("sev-2") || s.includes("high")) return "bad";
  if (s.includes("p3") || s.includes("medium")) return "warn";
  if (s.includes("low") || s.includes("p4")) return "good";
  return "neutral";
}

function statusTone(status: string): ChipTone {
  const s = status.toLowerCase();
  if (s.includes("closed")) return "good";
  if (s === "resolved" || s.endsWith("resolved")) return "good";
  if (s.includes("escalat") || s.includes("reopen")) return "bad";
  if (s.includes("active") || s === "open") return "bad";
  if (
    s.includes("investigat") ||
    s.includes("resolving") ||
    s.includes("mitigat")
  ) {
    return "warn";
  }
  return "neutral";
}

function impactTone(impact: string): ChipTone {
  const s = impact.toLowerCase();
  if (s.includes("critical") || s.includes("high")) return "bad";
  if (s.includes("medium")) return "warn";
  if (s.includes("low")) return "good";
  return "neutral";
}

function isResolved(status: string): boolean {
  return /resolved|closed/i.test(status);
}

/** Whether anyone has taken containment action beyond simply logging the incident. */
function isUntriaged(status: string): boolean {
  return /active|open/i.test(status) || !status.trim();
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** A P1/P2 still unowned after this long is an escalation, not a queue item. */
const UNASSIGNED_ESCALATION_DAYS = 1;

function toDraft(row: IncidentDetail): IncidentDraft {
  return {
    timestamp: toDateInput(row.timestamp),
    applicationId: row.applicationId,
    departmentName: row.departmentName ?? "",
    severity: row.severity,
    title: row.title,
    status: row.status,
    impact: row.impact,
    assignedTo: row.assignedTo ?? "",
    relatedReleaseCode: row.relatedReleaseCode ?? "",
    environmentName: row.environmentName,
  };
}

export default function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const lifecycle = useEntityLifecycleStatuses("/api/incident-lifecycle-config");
  const [row, setRow] = useState<IncidentDetail | null>(null);
  const [options, setOptions] = useState<IncidentOption[]>([]);
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  /** Id of the workflow step currently being written, so its button can spin. */
  const [pendingStep, setPendingStep] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, appList, releaseList, me] = await Promise.all([
      safeFetchJson<IncidentDetail>(`/api/incidents/${id}`, {
        signal,
        label: "incident-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<IncidentOption[]>("/api/incidents", {
        signal,
        label: "incidents-list",
      }),
      safeFetchJson<ApplicationOption[]>("/api/applications", {
        signal,
        label: "applications-list",
      }),
      safeFetchJson<ReleaseOption[]>("/api/releases", {
        signal,
        label: "releases-list",
      }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(list.ok ? list.data.map((i) => ({ id: i.id, incidentCode: i.incidentCode })) : []);
    setApplications(appList.ok ? appList.data.map((a) => ({ id: a.id, name: a.name })) : []);
    setReleases(
      releaseList.ok ? releaseList.data.map((r) => ({ releaseCode: r.releaseCode })) : []
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
    entityLabel: "incident",
    onSuccess: async () => {
      if (exceptionFromModalSave.current) {
        exceptionFromModalSave.current = false;
        if (edit.editing) {
          edit.completeSaveSuccess(INCIDENT_FIELD_LABELS);
        }
      }
      await load();
    },
  });

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.incidentCode.localeCompare(b.incidentCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.incidentCode })),
    [options]
  );

  const applicationOptions = useMemo(() => {
    const opts = [...applications]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => ({ value: a.id, label: a.name }));
    if (row?.applicationId && !opts.some((o) => o.value === row.applicationId)) {
      opts.unshift({
        value: row.applicationId,
        label: row.application?.name ?? row.applicationId,
      });
    }
    return opts;
  }, [applications, row?.applicationId, row?.application?.name]);

  const releaseCodeOptions = useMemo(() => {
    const opts = [...releases]
      .sort((a, b) => a.releaseCode.localeCompare(b.releaseCode, undefined, { numeric: true }))
      .map((r) => ({ value: r.releaseCode, label: r.releaseCode }));
    // Empty option clears the related release link.
    opts.unshift({ value: "", label: "— None —" });
    if (row?.relatedReleaseCode && !opts.some((o) => o.value === row.relatedReleaseCode)) {
      opts.splice(1, 0, {
        value: row.relatedReleaseCode,
        label: row.relatedReleaseCode,
      });
    }
    return opts;
  }, [releases, row?.relatedReleaseCode]);

  const severityOptions = useMemo(() => {
    const set = new Set(SEVERITY_OPTIONS.map((o) => o.value));
    if (row?.severity && !set.has(row.severity)) {
      return [{ value: row.severity, label: row.severity }, ...SEVERITY_OPTIONS];
    }
    return SEVERITY_OPTIONS;
  }, [row?.severity]);

  const statusOptions = useMemo(
    () => statusSelectOptions(lifecycle.createOptions, row?.status),
    [lifecycle.createOptions, row?.status]
  );

  const save = async () => {
    if (!row || !edit.draft) return;
    edit.setSaving(true);
    edit.setError(null);
    const d = edit.draft;
    // incidentCode is immutable — never include it in PATCH.
    const patchBody = {
      timestamp: d.timestamp,
      applicationId: d.applicationId,
      departmentName: nullIfEmpty(d.departmentName),
      severity: d.severity,
      title: d.title,
      status: d.status,
      impact: d.impact,
      assignedTo: nullIfEmpty(d.assignedTo),
      relatedReleaseCode: nullIfEmpty(d.relatedReleaseCode),
      environmentName: d.environmentName,
    };
    const res = await safeFetchJson(`/api/incidents/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
      label: "incident-patch",
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
      if (code === "TRANSITION_NEEDS_OVERRIDE" && d.status !== row.status) {
        const { status: _status, ...extraBody } = patchBody;
        exceptionFromModalSave.current = true;
        edit.discard();
        statusConfirm.presentException({
          targetStatus: d.status,
          targetLabel: d.status,
          patchUrl: `/api/incidents/${row.id}`,
          extraBody,
          unmetReasons,
          leadMessage: apiError || null,
        });
        return;
      }
      edit.setSaving(false);
      edit.setError(apiError || "Couldn’t save changes. Try again.");
      return;
    }
    edit.setSaving(false);
    edit.completeSaveSuccess(INCIDENT_FIELD_LABELS);
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
      patchUrl: `/api/incidents/${row.id}`,
    });
    setPendingStep(null);
  };

  const remove = async () => {
    if (!row) return;
    edit.setDeleting(true);
    const res = await safeFetchJson(`/api/incidents/${row.id}`, {
      method: "DELETE",
      label: "incident-delete",
      rejectHttpErrors: false,
    });
    edit.setDeleting(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t delete this incident.");
      edit.setDeleteOpen(false);
      return;
    }
    router.push("/incidents");
  };

  if (loading) return <p className="text-slate-500 dark:text-white/60">Loading incident…</p>;
  if (!row || !v) return <p className="text-slate-500 dark:text-white/60">Incident not found.</p>;

  const resolved = isResolved(v.status);
  const selectedApp = applications.find((a) => a.id === v.applicationId);
  const appName = selectedApp?.name ?? row.application.name;
  const relatedCode = v.relatedReleaseCode.trim();
  const showConnection = Boolean(relatedCode);
  // Only link out when the loaded release still matches the code on screen; an
  // unsaved edit to relatedReleaseCode would otherwise point at the old release.
  const releaseHref =
    row.relatedRelease && row.relatedRelease.releaseCode === relatedCode
      ? `/releases/${row.relatedRelease.id}`
      : undefined;
  const daysOpen = daysSince(v.timestamp || row.timestamp);
  const highSeverity = severityTone(v.severity) === "bad";
  const assignee = v.assignedTo.trim();
  const workflow = incidentWorkflow(
    v.status,
    (lifecycle.config as IncidentLifecycleConfig | null) ?? undefined
  );

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
      id: "untriaged",
      when: !resolved && isUntriaged(v.status),
      tone: "critical",
      label: `${v.severity || "Incident"} still active on ${appName}`,
      detail: "Nobody has started investigating — containment has not begun.",
    },
    {
      id: "unassigned",
      when: !resolved && !assignee,
      tone: highSeverity && daysOpen >= UNASSIGNED_ESCALATION_DAYS ? "critical" : "warning",
      label: "No owner assigned",
      detail: "An unowned incident has nobody accountable for driving it to resolution.",
    },
    {
      id: "release-exposed",
      when: !resolved && Boolean(relatedCode),
      tone: highSeverity ? "critical" : "warning",
      label: `${relatedCode} is exposed`,
      detail: "This release should not proceed while the incident is open.",
      href: releaseHref,
    },
    {
      id: "high-impact",
      when: !resolved && impactTone(v.impact) === "bad",
      tone: "critical",
      label: `${v.impact} impact`,
    },
    {
      id: "ageing",
      when: !resolved && highSeverity && daysOpen > UNASSIGNED_ESCALATION_DAYS,
      tone: "warning",
      label: `Open ${daysOpen} days`,
      detail: "A high-severity incident running this long warrants escalation.",
    },
  ]);

  const signals: DetailFact[] = [
    {
      label: "Severity",
      value: v.severity || "—",
      tone: chipToneToFactTone(severityTone(v.severity)),
    },
    {
      label: "Impact",
      value: v.impact || "—",
      tone: chipToneToFactTone(impactTone(v.impact)),
    },
    {
      label: "Owner",
      value: assignee || "Unassigned",
      tone: assignee ? "neutral" : "warn",
    },
  ];

  const timing: DetailFact[] = [
    { label: "Raised", value: v.timestamp ? formatDate(v.timestamp) : "—" },
    {
      label: "Age",
      value: `${daysOpen} day${daysOpen === 1 ? "" : "s"}`,
      tone: resolved ? "neutral" : highSeverity && daysOpen > UNASSIGNED_ESCALATION_DAYS ? "bad" : "warn",
    },
  ];

  const scope: DetailFact[] = [
    { label: "Application", value: appName },
    { label: "Environment", value: v.environmentName || "—" },
    { label: "Department", value: v.departmentName || "—" },
    {
      label: "Related release",
      value: relatedCode || "None",
      href: releaseHref,
    },
  ];

  return (
    <EditableDetailShell
      pageTitle="Incident Detail"
      pageDescription="Confirmed production (or env) incident on an application — severity, impact, and assignment show how urgently it must clear before related releases can proceed."
      entityLabel="Incident"
      entityCode={row.incidentCode}
      entityName={v.title || row.incidentCode}
      selectLabel="Select Incident"
      selectValue={row.id}
      selectOptions={selectOptions}
      onSelectChange={(next) => next !== row.id && router.push(`/incidents/${next}`)}
      lastRefresh={lastRefresh}
      footer="Incident Page v2.0 · Incidents · Incident ID is locked"
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
      lockedIdLabel="Incident ID"
      successChanges={edit.successChanges}
      onSuccessDismiss={edit.dismissSuccess}
      editForm={
        d ? (
          <EditableFieldGrid cols={2}>
            <EditableField
              label="Severity"
              value={d.severity}
              editing
              kind="select"
              options={severityOptions}
              onChange={(n) => edit.setField("severity", n)}
            />
            <EditableField
              label="Status"
              value={d.status}
              editing
              kind="select"
              options={statusOptions}
              onChange={(n) => edit.setField("status", n)}
            />
            <EditableField
              label="Impact"
              value={d.impact}
              editing
              onChange={(n) => edit.setField("impact", n)}
              placeholder="e.g. High…"
            />
            <EditableField
              label="Title"
              value={d.title}
              editing
              onChange={(n) => edit.setField("title", n)}
              placeholder="Incident title…"
            />
            <EditableField
              label="Created"
              value={d.timestamp}
              editing
              kind="date"
              onChange={(n) => edit.setField("timestamp", n)}
            />
            <EditableField
              label="Application"
              value={d.applicationId}
              editing
              kind="select"
              options={applicationOptions}
              onChange={(n) => edit.setField("applicationId", n)}
            />
            <EditableField
              label="Department"
              value={d.departmentName}
              editing
              onChange={(n) => edit.setField("departmentName", n)}
              placeholder="Department…"
            />
            <EditableField
              label="Environment"
              value={d.environmentName}
              editing
              mono
              onChange={(n) => edit.setField("environmentName", n)}
              placeholder="e.g. Prod…"
            />
            <EditableField
              label="Related Release"
              value={d.relatedReleaseCode}
              editing
              kind="select"
              options={releaseCodeOptions}
              onChange={(n) => edit.setField("relatedReleaseCode", n)}
              mono
            />
            <EditableField
              label="Assigned To"
              value={d.assignedTo}
              editing
              onChange={(n) => edit.setField("assignedTo", n)}
              placeholder="Owner name…"
            />
          </EditableFieldGrid>
        ) : null
      }
      relatedLinks={
        <>
          {row.relatedRelease && (
            <ProgressLink
              href={`/releases/${row.relatedRelease.id}`}
              className={taBtnSecondary + " text-sm !py-2"}
            >
              <Package className="mr-1.5 inline h-4 w-4" aria-hidden />
              View Release
            </ProgressLink>
          )}
          <ProgressLink href="/monitoring-alerts" className={taBtnSecondary + " text-sm !py-2"}>
            <Activity className="mr-1.5 inline h-4 w-4" aria-hidden />
            Alerts
          </ProgressLink>
          <ProgressLink href="/incidents" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            All Incidents
          </ProgressLink>
        </>
      }
    >
      <DetailDecisionHeader
        status={{
          label: v.status,
          tone: statusTone(v.status),
          caption: resolved
            ? "Incident cleared"
            : `Open ${daysOpen} day${daysOpen === 1 ? "" : "s"}${assignee ? ` with ${assignee}` : ", unowned"}`,
        }}
        signals={signals}
        primaryAction={workflow.primary ? toAction(workflow.primary) : null}
        secondaryActions={workflow.secondary.map(toAction)}
        canEdit={canEdit}
        actionError={null}
        attention={attention}
        attentionClearLabel="Incident cleared — no release is being held by this"
        timing={timing}
        scope={scope}
      />

      <LifecycleExceptionModal
        open={Boolean(statusConfirm.pending)}
        onDismiss={statusConfirm.cancel}
      >
        {statusConfirm.pending ? (
          <LifecycleExceptionConfirm
            targetLabel={statusConfirm.pending.targetLabel}
            needsException={statusConfirm.pending.needsException}
            blocked={statusConfirm.pending.blocked}
            exceptionReason={statusConfirm.exceptionReason}
            onExceptionReasonChange={statusConfirm.setExceptionReason}
            autoFocusReason={statusConfirm.pending.needsException}
            busy={statusConfirm.busy}
            confirmDisabled={statusConfirm.confirmDisabled}
            onCancel={statusConfirm.cancel}
            onConfirm={() => void statusConfirm.confirm()}
            checks={statusConfirm.pending.checks}
            leadMessage={statusConfirm.pending.leadMessage}
          />
        ) : null}
      </LifecycleExceptionModal>
      <FormAlertDialog alert={statusConfirm.alert} onDismiss={statusConfirm.dismissAlert} />

      <DetailSection
        icon={FileText}
        tone="amber"
        title="Timeline"
        description="Created → current status → resolution, driven by the stored timestamp and status."
      >
        <EntityTimeline
          phases={[
            {
              label: "Created",
              detail: v.timestamp ? formatDate(v.timestamp) : "—",
              complete: true,
              tone: "rose",
            },
            {
              label: "Current Status",
              detail: v.status,
              active: !resolved,
              complete: resolved,
              tone: resolved ? "emerald" : "amber",
            },
            {
              label: "Resolution",
              detail: resolved
                ? "Marked resolved"
                : (workflow.primary?.label ?? "Awaiting next step"),
              complete: resolved,
              tone: "emerald",
            },
          ]}
        />
      </DetailSection>

      <DetailSection
        icon={Package}
        tone="indigo"
        title="Related release"
        description="Optional release this incident may block until severity and status clear."
      >
        {showConnection && (
          <div className="mb-4">
            <EntityConnection
              source={appName}
              target={
                row.relatedRelease && row.relatedRelease.releaseCode === relatedCode ? (
                  <ProgressLink
                    href={`/releases/${row.relatedRelease.id}`}
                    className="text-sky-600 hover:underline dark:text-sky-300"
                  >
                    {relatedCode}
                  </ProgressLink>
                ) : (
                  relatedCode
                )
              }
              caption={
                row.relatedRelease && row.relatedRelease.releaseCode === relatedCode
                  ? `${row.relatedRelease.name} · ${row.relatedRelease.status}`
                  : "Linked by release code"
              }
            />
          </div>
        )}
        {!showConnection && <EmptyHint>No release is linked to this incident.</EmptyHint>}
      </DetailSection>
    </EditableDetailShell>
  );
}
