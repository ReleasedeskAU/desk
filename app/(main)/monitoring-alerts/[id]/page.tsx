"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, Gauge, List } from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  EditableField,
  EditableFieldGrid,
  ThresholdVisual,
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
import { alertWorkflow, type WorkflowStep } from "@/lib/entity-workflow";
import { useEntityLifecycleStatuses } from "@/hooks/useEntityLifecycleStatuses";
import { statusSelectOptions } from "@/lib/entity-lifecycle-status-ui";
import type { AlertLifecycleConfig } from "@/lib/alert-lifecycle-config";

type AlertDetail = {
  id: string;
  alertCode: string;
  timestamp: string;
  applicationId: string;
  departmentName: string | null;
  alertType: string;
  severity: string;
  metric: string;
  threshold: string | null;
  currentValue: string | null;
  status: string;
  assignedTo: string | null;
  environmentName: string;
  application: { id: string; name: string };
};

type AlertOption = { id: string; alertCode: string };
type ApplicationOption = { id: string; name: string };

type AlertDraft = {
  timestamp: string;
  applicationId: string;
  departmentName: string;
  alertType: string;
  severity: string;
  metric: string;
  threshold: string;
  currentValue: string;
  status: string;
  assignedTo: string;
  environmentName: string;
};

const ALERT_FIELD_LABELS: Partial<Record<keyof AlertDraft, string>> = {
  timestamp: "Triggered",
  applicationId: "Application",
  departmentName: "Department",
  alertType: "Alert Type",
  severity: "Severity",
  metric: "Metric",
  threshold: "Threshold",
  currentValue: "Current Value",
  status: "Status",
  assignedTo: "Assigned To",
  environmentName: "Environment",
};

const SEVERITY_OPTIONS = ["Critical", "High", "Medium", "Low", "Info"].map((v) => ({
  value: v,
  label: v,
}));


function toDateInput(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/** Parse the first numeric token from mixed seed strings (e.g. "200ms", "0.85"). */
function numericValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function severityTone(severity: string): ChipTone {
  const s = severity.toLowerCase();
  if (s.includes("critical") || s.includes("high")) return "bad";
  if (s.includes("medium") || s.includes("warning")) return "warn";
  if (s.includes("low") || s.includes("info")) return "good";
  return "neutral";
}

function statusTone(status: string): ChipTone {
  const s = status.toLowerCase();
  if (s.includes("open") || s.includes("firing") || s.includes("active")) return "bad";
  if (s.includes("ack") || s.includes("investigat") || s.includes("progress")) return "warn";
  if (s.includes("resolv") || s.includes("closed") || s.includes("clear")) return "good";
  return "neutral";
}

/** Nobody has looked at the alert yet — distinct from "open but being worked". */
function isUnacknowledged(status: string): boolean {
  const s = status.toLowerCase();
  return /open|firing|active/.test(s) || !s.trim();
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** An alert still firing after this long has become a standing problem. */
const STALE_ALERT_DAYS = 3;

function toDraft(row: AlertDetail): AlertDraft {
  return {
    timestamp: toDateInput(row.timestamp),
    applicationId: row.applicationId,
    departmentName: row.departmentName ?? "",
    alertType: row.alertType,
    severity: row.severity,
    metric: row.metric,
    threshold: row.threshold ?? "",
    currentValue: row.currentValue ?? "",
    status: row.status,
    assignedTo: row.assignedTo ?? "",
    environmentName: row.environmentName,
  };
}

export default function MonitoringAlertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const lifecycle = useEntityLifecycleStatuses("/api/alert-lifecycle-config");
  const [row, setRow] = useState<AlertDetail | null>(null);
  const [options, setOptions] = useState<AlertOption[]>([]);
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  /** Id of the workflow step currently being written, so its button can spin. */
  const [pendingStep, setPendingStep] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, appList, me] = await Promise.all([
      safeFetchJson<AlertDetail>(`/api/monitoring-alerts/${id}`, {
        signal,
        label: "alert-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<AlertOption[]>("/api/monitoring-alerts", {
        signal,
        label: "alerts-list",
      }),
      safeFetchJson<ApplicationOption[]>("/api/applications", {
        signal,
        label: "applications-list",
      }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(list.ok ? list.data.map((a) => ({ id: a.id, alertCode: a.alertCode })) : []);
    setApplications(appList.ok ? appList.data.map((a) => ({ id: a.id, name: a.name })) : []);
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
    entityLabel: "alert",
    onSuccess: async () => {
      if (exceptionFromModalSave.current) {
        exceptionFromModalSave.current = false;
        if (edit.editing) {
          edit.completeSaveSuccess(ALERT_FIELD_LABELS);
        }
      }
      await load();
    },
  });

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.alertCode.localeCompare(b.alertCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.alertCode })),
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
    // alertCode is immutable — never include it in PATCH.
    const patchBody = {
      timestamp: d.timestamp,
      applicationId: d.applicationId,
      departmentName: d.departmentName || null,
      alertType: d.alertType,
      severity: d.severity,
      metric: d.metric,
      threshold: d.threshold || null,
      currentValue: d.currentValue || null,
      status: d.status,
      assignedTo: d.assignedTo || null,
      environmentName: d.environmentName,
    };
    const res = await safeFetchJson(`/api/monitoring-alerts/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
      label: "alert-patch",
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
          patchUrl: `/api/monitoring-alerts/${row.id}`,
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
    edit.completeSaveSuccess(ALERT_FIELD_LABELS);
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
      patchUrl: `/api/monitoring-alerts/${row.id}`,
    });
    setPendingStep(null);
  };

  const remove = async () => {
    if (!row) return;
    edit.setDeleting(true);
    const res = await safeFetchJson(`/api/monitoring-alerts/${row.id}`, {
      method: "DELETE",
      label: "alert-delete",
      rejectHttpErrors: false,
    });
    edit.setDeleting(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t delete this alert.");
      edit.setDeleteOpen(false);
      return;
    }
    router.push("/monitoring-alerts");
  };

  if (loading) return <p className="text-slate-500 dark:text-white/60">Loading alert…</p>;
  if (!row || !v) return <p className="text-slate-500 dark:text-white/60">Alert not found.</p>;

  const openish = !/resolv|closed|clear/i.test(v.status);
  const selectedApp = applications.find((a) => a.id === v.applicationId);
  const appName = selectedApp?.name ?? row.application.name;
  const currentMetric = numericValue(v.currentValue);
  const thresholdMetric = numericValue(v.threshold);
  const showThreshold = currentMetric != null && thresholdMetric != null;
  const overThreshold = showThreshold && currentMetric > thresholdMetric;
  const daysOpen = daysSince(v.timestamp || row.timestamp);
  const highSeverity = severityTone(v.severity) === "bad";
  const assignee = v.assignedTo.trim();
  const workflow = alertWorkflow(
    v.status,
    (lifecycle.config as AlertLifecycleConfig | null) ?? undefined
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
      id: "unacknowledged",
      when: openish && isUnacknowledged(v.status),
      tone: highSeverity ? "critical" : "warning",
      label: `${v.severity || "Alert"} firing on ${appName}, not acknowledged`,
      detail: "Nobody has confirmed they have seen this alert.",
    },
    {
      id: "unassigned",
      when: openish && !assignee,
      tone: highSeverity ? "critical" : "warning",
      label: "No owner assigned",
      detail: "Unowned alerts are how a metric breach becomes an incident.",
    },
    {
      id: "over-threshold",
      when: openish && overThreshold,
      tone: highSeverity ? "critical" : "warning",
      label: `${v.metric || "Metric"} is above threshold`,
      detail: `Reading ${v.currentValue} against a threshold of ${v.threshold}.`,
    },
    {
      id: "stale",
      when: openish && daysOpen > STALE_ALERT_DAYS,
      tone: "warning",
      label: `Firing ${daysOpen} days`,
      detail: "A long-running alert is either a real problem or a threshold that needs retuning.",
    },
  ]);

  const signals: DetailFact[] = [
    {
      label: "Severity",
      value: v.severity || "—",
      tone: chipToneToFactTone(severityTone(v.severity)),
    },
    {
      label: "Reading",
      value: v.currentValue || "—",
      tone: openish && overThreshold ? "bad" : "neutral",
      hint: v.threshold ? `Threshold ${v.threshold}` : "No threshold recorded",
    },
    {
      label: "Owner",
      value: assignee || "Unassigned",
      tone: assignee ? "neutral" : "warn",
    },
  ];

  const timing: DetailFact[] = [
    { label: "Triggered", value: v.timestamp ? formatDate(v.timestamp) : "—" },
    {
      label: "Firing for",
      value: `${daysOpen} day${daysOpen === 1 ? "" : "s"}`,
      tone: !openish ? "neutral" : daysOpen > STALE_ALERT_DAYS ? "bad" : "warn",
    },
  ];

  const scope: DetailFact[] = [
    { label: "Application", value: appName },
    { label: "Environment", value: v.environmentName || "—" },
    { label: "Department", value: v.departmentName || "—" },
    { label: "Alert type", value: v.alertType || "—" },
  ];

  return (
    <EditableDetailShell
      pageTitle="Alert Detail"
      pageDescription="Live metric breach vs threshold for an application environment — severity and assignment show how urgently ops must clear it before it becomes an incident."
      entityLabel="Alert"
      entityCode={row.alertCode}
      entityName={v.metric || row.alertCode}
      selectLabel="Select Alert"
      selectValue={row.id}
      selectOptions={selectOptions}
      onSelectChange={(next) => next !== row.id && router.push(`/monitoring-alerts/${next}`)}
      lastRefresh={lastRefresh}
      footer="Alert Page v2.0 · Monitoring Alerts · Alert ID is locked"
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
      lockedIdLabel="Alert ID"
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
              label="Alert Type"
              value={d.alertType}
              editing
              onChange={(n) => edit.setField("alertType", n)}
              placeholder="Alert type…"
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
              label="Triggered"
              value={d.timestamp}
              editing
              kind="date"
              onChange={(n) => edit.setField("timestamp", n)}
            />
            <EditableField
              label="Metric"
              value={d.metric}
              editing
              onChange={(n) => edit.setField("metric", n)}
              placeholder="Metric name…"
            />
            <EditableField
              label="Current Value"
              value={d.currentValue}
              editing
              onChange={(n) => edit.setField("currentValue", n)}
              placeholder="Current value…"
            />
            <EditableField
              label="Threshold"
              value={d.threshold}
              editing
              onChange={(n) => edit.setField("threshold", n)}
              placeholder="Threshold…"
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
          <ProgressLink href="/monitoring-alerts" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            All Alerts
          </ProgressLink>
          <ProgressLink href="/application-status" className={taBtnSecondary + " text-sm !py-2"}>
            <Activity className="mr-1.5 inline h-4 w-4" aria-hidden />
            App Status
          </ProgressLink>
          <ProgressLink href="/incidents" className={taBtnSecondary + " text-sm !py-2"}>
            <AlertTriangle className="mr-1.5 inline h-4 w-4" aria-hidden />
            Incidents
          </ProgressLink>
        </>
      }
    >
      <DetailDecisionHeader
        status={{
          label: v.status,
          tone: statusTone(v.status),
          caption: openish
            ? `Firing on ${v.environmentName || "this environment"}${assignee ? ` with ${assignee}` : ", unowned"}`
            : "Alert cleared",
        }}
        signals={signals}
        primaryAction={workflow.primary ? toAction(workflow.primary) : null}
        secondaryActions={workflow.secondary.map(toAction)}
        canEdit={canEdit}
        actionError={null}
        attention={attention}
        attentionClearLabel="Alert cleared — the metric is back within threshold"
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
        icon={Gauge}
        tone="amber"
        title="Metric details"
        description="Current reading vs threshold — both stay as text to support mixed seed formats."
      >
        <EditableFieldGrid>
          <EditableField label="Metric" value={v.metric} editing={false} />
          <EditableField label="Current Value" value={v.currentValue} editing={false} />
          <EditableField label="Threshold" value={v.threshold} editing={false} />
        </EditableFieldGrid>
        {showThreshold && (
          <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
            <ThresholdVisual current={currentMetric} threshold={thresholdMetric} />
          </div>
        )}
      </DetailSection>
    </EditableDetailShell>
  );
}
