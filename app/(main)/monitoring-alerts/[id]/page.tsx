"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  AppWindow,
  Bell,
  Gauge,
  List,
  User,
  Zap,
} from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  LockedIdField,
  EditableField,
  EditableFieldGrid,
  StatusChip,
  HeroStatusRow,
  TintedCallout,
  ThresholdVisual,
  type ChipTone,
} from "@/components/detail/editable";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";

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

const SEVERITY_OPTIONS = ["Critical", "High", "Medium", "Low", "Info"].map((v) => ({
  value: v,
  label: v,
}));

const STATUS_OPTIONS = ["Open", "Acknowledged", "Investigating", "Resolved", "Closed"].map(
  (v) => ({ value: v, label: v })
);

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

function heroToneFromSeverity(severity: string): "rose" | "amber" | "emerald" | "sky" {
  const t = severityTone(severity);
  if (t === "bad") return "rose";
  if (t === "warn") return "amber";
  if (t === "good") return "emerald";
  return "sky";
}

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
  const [row, setRow] = useState<AlertDetail | null>(null);
  const [options, setOptions] = useState<AlertOption[]>([]);
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

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

  const statusOptions = useMemo(() => {
    const set = new Set(STATUS_OPTIONS.map((o) => o.value));
    if (row?.status && !set.has(row.status)) {
      return [{ value: row.status, label: row.status }, ...STATUS_OPTIONS];
    }
    return STATUS_OPTIONS;
  }, [row?.status]);

  const save = async () => {
    if (!row || !edit.draft) return;
    edit.setSaving(true);
    edit.setError(null);
    const d = edit.draft;
    // alertCode is immutable — never include it in PATCH.
    const res = await safeFetchJson(`/api/monitoring-alerts/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
      label: "alert-patch",
      rejectHttpErrors: false,
    });
    edit.setSaving(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t save changes. Try again.");
      return;
    }
    edit.discard();
    edit.setSaveMessage("Saved");
    await load();
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
  const currentMetric = numericValue(v.currentValue);
  const thresholdMetric = numericValue(v.threshold);
  const showThreshold = currentMetric != null && thresholdMetric != null;

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
      saveMessage={edit.saveMessage}
      onEdit={edit.startEdit}
      onDiscard={edit.discard}
      onSave={save}
      deleteOpen={edit.deleteOpen}
      onDeleteOpen={() => edit.setDeleteOpen(true)}
      onDeleteCancel={() => edit.setDeleteOpen(false)}
      onDeleteConfirm={remove}
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
      {edit.error && <TintedCallout tone="rose">{edit.error}</TintedCallout>}

      <HeroStatusRow
        hero={{
          icon: Bell,
          label: "Severity",
          value: v.severity,
          tone: heroToneFromSeverity(v.severity),
        }}
        secondary={{
          icon: Zap,
          label: "Status",
          value: v.status,
        }}
        metric={{
          icon: Gauge,
          label: "Alert Type",
          percent: openish ? (severityTone(v.severity) === "bad" ? 90 : 55) : 100,
          caption: v.alertType || "—",
          tone: openish ? heroToneFromSeverity(v.severity) : "emerald",
        }}
      />

      <DetailSection
        icon={Bell}
        tone="rose"
        title="Alert status"
        description="How urgent this breach is and whether ops has cleared it yet."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusChip
            label={openish ? "⚠️ ALERT OPEN" : "✓ CLEARED"}
            tone={openish ? "bad" : "good"}
          />
          <StatusChip label={v.severity} tone={severityTone(v.severity)} />
          <StatusChip label={v.status} tone={statusTone(v.status)} />
        </div>
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Alert ID" value={row.alertCode} />
          <EditableField
            label="Severity"
            value={v.severity}
            editing={edit.editing}
            kind="select"
            options={severityOptions}
            onChange={(n) => edit.setField("severity", n)}
            display={<StatusChip label={v.severity} tone={severityTone(v.severity)} />}
          />
          <EditableField
            label="Status"
            value={v.status}
            editing={edit.editing}
            kind="select"
            options={statusOptions}
            onChange={(n) => edit.setField("status", n)}
            display={<StatusChip label={v.status} tone={statusTone(v.status)} />}
          />
          <EditableField
            label="Alert Type"
            value={v.alertType}
            editing={edit.editing}
            onChange={(n) => edit.setField("alertType", n)}
            placeholder="Alert type…"
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={AppWindow}
        tone="sky"
        title="Application & environment"
        description="Where the breach fired — application, department, and environment."
      >
        <EditableFieldGrid>
          <EditableField
            label="Application"
            value={v.applicationId}
            editing={edit.editing}
            kind="select"
            options={applicationOptions}
            onChange={(n) => edit.setField("applicationId", n)}
            display={selectedApp?.name ?? row.application.name}
          />
          <EditableField
            label="Department"
            value={v.departmentName}
            editing={edit.editing}
            onChange={(n) => edit.setField("departmentName", n)}
            placeholder="Department…"
          />
          <EditableField
            label="Environment"
            value={v.environmentName}
            editing={edit.editing}
            mono
            onChange={(n) => edit.setField("environmentName", n)}
            placeholder="e.g. Prod…"
          />
          <EditableField
            label="Triggered"
            value={v.timestamp}
            editing={edit.editing}
            kind="date"
            onChange={(n) => edit.setField("timestamp", n)}
            display={v.timestamp ? formatDate(v.timestamp) : "—"}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={Gauge}
        tone="amber"
        title="Metric details"
        description="Current reading vs threshold — both stay as text to support mixed seed formats."
      >
        <EditableFieldGrid>
          <EditableField
            label="Metric"
            value={v.metric}
            editing={edit.editing}
            onChange={(n) => edit.setField("metric", n)}
            placeholder="Metric name…"
          />
          <EditableField
            label="Current Value"
            value={v.currentValue}
            editing={edit.editing}
            onChange={(n) => edit.setField("currentValue", n)}
            placeholder="Current value…"
          />
          <EditableField
            label="Threshold"
            value={v.threshold}
            editing={edit.editing}
            onChange={(n) => edit.setField("threshold", n)}
            placeholder="Threshold…"
          />
        </EditableFieldGrid>
        {showThreshold && (
          <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
            <ThresholdVisual current={currentMetric} threshold={thresholdMetric} />
          </div>
        )}
      </DetailSection>

      <DetailSection
        icon={User}
        tone="emerald"
        title="Assignment"
        description="Who owns clearing this alert before it escalates to an incident."
      >
        <EditableFieldGrid>
          <EditableField
            label="Assigned To"
            value={v.assignedTo}
            editing={edit.editing}
            onChange={(n) => edit.setField("assignedTo", n)}
            placeholder="Owner name…"
          />
        </EditableFieldGrid>
        {!edit.editing && !v.assignedTo.trim() && (
          <div className="mt-3">
            <TintedCallout tone="amber">No owner assigned yet.</TintedCallout>
          </div>
        )}
      </DetailSection>
    </EditableDetailShell>
  );
}
