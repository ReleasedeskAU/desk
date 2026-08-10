"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, FileText, List, Package } from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  EditableField,
  EditableFieldGrid,
  TintedCallout,
  EntityTimeline,
  type ChipTone,
} from "@/components/detail/editable";
import { DetailDecisionHeader } from "@/components/detail/decision";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";
import {
  chipToneToFactTone,
  collectAttention,
  describeDue,
  dueTone,
  type DetailAction,
  type DetailFact,
} from "@/lib/detail-decision";
import { maintenanceWorkflow, type WorkflowStep } from "@/lib/entity-workflow";

type MaintenanceDetail = {
  id: string;
  maintenanceCode: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  type: string;
  applicationId: string | null;
  environmentName: string;
  departmentName: string | null;
  impact: string;
  requestor: string | null;
  approvalStatus: string;
  notes: string | null;
  application: { id: string; name: string } | null;
};

type MaintenanceOption = { id: string; maintenanceCode: string };
type ApplicationOption = { id: string; name: string };

type MaintenanceDraft = {
  scheduledDate: string;
  startTime: string;
  endTime: string;
  type: string;
  applicationId: string;
  environmentName: string;
  departmentName: string;
  impact: string;
  requestor: string;
  approvalStatus: string;
  notes: string;
};

const MAINTENANCE_FIELD_LABELS: Partial<Record<keyof MaintenanceDraft, string>> = {
  scheduledDate: "Scheduled Date",
  startTime: "Start Time",
  endTime: "End Time",
  type: "Type",
  applicationId: "Application",
  environmentName: "Environment",
  departmentName: "Department",
  impact: "Impact",
  requestor: "Requestor",
  approvalStatus: "Approval Status",
  notes: "Notes",
};

const APPROVAL_OPTIONS = [
  "Pending",
  "Scheduled",
  "Approved",
  "In Progress",
  "Completed",
  "Cancelled",
  "Rejected",
].map((v) => ({ value: v, label: v }));

function toDateInput(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function nullIfEmpty(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

/** Combine scheduled date + clock time for timeline detail labels. */
function windowLabel(dateIso: string, time: string) {
  const date = dateIso ? formatDate(dateIso) : "—";
  return time ? `${date} ${time}` : date;
}

/** Duration between HH:MM start/end, wrapping overnight windows. */
function durationLabel(startTime: string, endTime: string) {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
  };
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start == null || end == null) return "—";
  const total = (end - start + 24 * 60) % (24 * 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours ? `${hours}h ` : ""}${minutes ? `${minutes}m` : hours ? "" : "0m"}`.trim();
}

function approvalTone(status: string): ChipTone {
  const s = status.toLowerCase();
  if (s.includes("approv") || s.includes("complete")) return "good";
  if (s.includes("schedul") || s.includes("pending") || s.includes("progress")) return "warn";
  if (s.includes("cancel") || s.includes("reject")) return "bad";
  return "neutral";
}

function impactTone(impact: string): ChipTone {
  const s = impact.toLowerCase();
  if (s.includes("critical") || s.includes("high")) return "bad";
  if (s.includes("medium")) return "warn";
  if (s.includes("low")) return "good";
  return "neutral";
}

/**
 * A window this close to its slot must already be approved — CAB cannot
 * realistically turn it around inside this many days.
 */
const APPROVAL_CUTOFF_DAYS = 3;

function toDraft(row: MaintenanceDetail): MaintenanceDraft {
  return {
    scheduledDate: toDateInput(row.scheduledDate),
    startTime: row.startTime ?? "",
    endTime: row.endTime ?? "",
    type: row.type,
    applicationId: row.applicationId ?? "",
    environmentName: row.environmentName,
    departmentName: row.departmentName ?? "",
    impact: row.impact,
    requestor: row.requestor ?? "",
    approvalStatus: row.approvalStatus,
    notes: row.notes ?? "",
  };
}

export default function MaintenanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<MaintenanceDetail | null>(null);
  const [options, setOptions] = useState<MaintenanceOption[]>([]);
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  /** Id of the workflow step currently being written, so its button can spin. */
  const [pendingStep, setPendingStep] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, appList, me] = await Promise.all([
      safeFetchJson<MaintenanceDetail>(`/api/planned-maintenance/${id}`, {
        signal,
        label: "maintenance-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<MaintenanceOption[]>("/api/planned-maintenance", {
        signal,
        label: "maintenance-list",
      }),
      safeFetchJson<ApplicationOption[]>("/api/applications", {
        signal,
        label: "applications-list",
      }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(
      list.ok ? list.data.map((m) => ({ id: m.id, maintenanceCode: m.maintenanceCode })) : []
    );
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

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) =>
          a.maintenanceCode.localeCompare(b.maintenanceCode, undefined, { numeric: true })
        )
        .map((o) => ({ value: o.id, label: o.maintenanceCode })),
    [options]
  );

  const applicationOptions = useMemo(() => {
    const opts = [...applications]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => ({ value: a.id, label: a.name }));
    // Empty option clears the optional application FK.
    opts.unshift({ value: "", label: "— None —" });
    if (row?.applicationId && !opts.some((o) => o.value === row.applicationId)) {
      opts.splice(1, 0, {
        value: row.applicationId,
        label: row.application?.name ?? row.applicationId,
      });
    }
    return opts;
  }, [applications, row?.applicationId, row?.application?.name]);

  const approvalOptions = useMemo(() => {
    const set = new Set(APPROVAL_OPTIONS.map((o) => o.value));
    if (row?.approvalStatus && !set.has(row.approvalStatus)) {
      return [{ value: row.approvalStatus, label: row.approvalStatus }, ...APPROVAL_OPTIONS];
    }
    return APPROVAL_OPTIONS;
  }, [row?.approvalStatus]);

  const save = async () => {
    if (!row || !edit.draft) return;
    edit.setSaving(true);
    edit.setError(null);
    const d = edit.draft;
    // maintenanceCode is immutable — never include it in PATCH.
    const res = await safeFetchJson(`/api/planned-maintenance/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduledDate: d.scheduledDate,
        startTime: d.startTime,
        endTime: d.endTime,
        type: d.type,
        applicationId: nullIfEmpty(d.applicationId),
        environmentName: d.environmentName,
        departmentName: nullIfEmpty(d.departmentName),
        impact: d.impact,
        requestor: nullIfEmpty(d.requestor),
        approvalStatus: d.approvalStatus,
        notes: nullIfEmpty(d.notes),
      }),
      label: "maintenance-patch",
      rejectHttpErrors: false,
    });
    edit.setSaving(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t save changes. Try again.");
      return;
    }
    edit.completeSaveSuccess(MAINTENANCE_FIELD_LABELS);
    await load();
  };

  /**
   * Apply a one-click approval/execution transition from the decision header.
   * The API re-validates the value and enforces the editor role — this button
   * is convenience, not the approval authority itself.
   */
  const applyStep = async (step: WorkflowStep) => {
    if (!row) return;
    setPendingStep(step.id);
    setStepError(null);
    const res = await safeFetchJson(`/api/planned-maintenance/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalStatus: step.status }),
      label: "maintenance-status-step",
      rejectHttpErrors: false,
    });
    setPendingStep(null);
    if (!res.ok || res.status >= 300) {
      setStepError(`Couldn’t set this window to ${step.status}. Try again.`);
      return;
    }
    await load();
  };

  const remove = async () => {
    if (!row) return;
    edit.setDeleting(true);
    const res = await safeFetchJson(`/api/planned-maintenance/${row.id}`, {
      method: "DELETE",
      label: "maintenance-delete",
      rejectHttpErrors: false,
    });
    edit.setDeleting(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t delete this maintenance window.");
      edit.setDeleteOpen(false);
      return;
    }
    router.push("/planned-maintenance");
  };

  if (loading) return <p className="text-slate-500 dark:text-white/60">Loading maintenance…</p>;
  if (!row || !v) {
    return <p className="text-slate-500 dark:text-white/60">Maintenance not found.</p>;
  }

  const selectedApp = applications.find((a) => a.id === v.applicationId);
  const appName = selectedApp?.name ?? row.application?.name ?? null;
  const windowActive = /approv|schedul|progress/i.test(v.approvalStatus);
  const windowDone = /complete/i.test(v.approvalStatus);
  const cancelled = /cancel|reject/i.test(v.approvalStatus);
  const awaitingApproval = /pending/i.test(v.approvalStatus);
  const slot = describeDue(v.scheduledDate);
  const upcoming = !windowDone && !cancelled;
  const workflow = maintenanceWorkflow(v.approvalStatus);

  const toAction = (step: WorkflowStep): DetailAction => ({
    id: step.id,
    label: step.label,
    write: true,
    pending: pendingStep === step.id,
    disabled: pendingStep !== null,
    onClick: () => void applyStep(step),
  });

  // A pending window inside the CAB turnaround is an escalation; further out
  // it is only a reminder. The two are mutually exclusive so they never stack.
  const approvalLate =
    awaitingApproval && upcoming && slot.days != null && slot.days <= APPROVAL_CUTOFF_DAYS;

  const attention = collectAttention([
    {
      id: "approval-late",
      when: approvalLate,
      tone: "critical",
      label: `Slot is ${slot.label.toLowerCase()} and still unapproved`,
      detail: "CAB has not signed off a window that is about to start.",
    },
    {
      id: "awaiting-approval",
      when: awaitingApproval && upcoming && !approvalLate,
      tone: "warning",
      label: "Awaiting CAB approval",
    },
    {
      id: "high-impact",
      when: upcoming && impactTone(v.impact) === "bad",
      tone: "warning",
      label: `${v.impact} impact on ${v.environmentName || "this environment"}`,
      detail: "Releases should not be scheduled into this window.",
    },
    {
      id: "no-times",
      when: upcoming && !(v.startTime && v.endTime),
      tone: "warning",
      label: "Window times incomplete",
      detail: "Without a start and end time, other teams cannot plan around this slot.",
    },
    {
      id: "no-requestor",
      when: upcoming && !v.requestor.trim(),
      tone: "warning",
      label: "No requestor recorded",
    },
    {
      id: "cancelled",
      when: cancelled,
      tone: "warning",
      label: `Window ${v.approvalStatus.toLowerCase()}`,
      detail: "This slot is not happening — anything planned around it needs rechecking.",
    },
  ]);

  const signals: DetailFact[] = [
    {
      label: "Impact",
      value: v.impact || "—",
      tone: windowDone || cancelled ? "neutral" : chipToneToFactTone(impactTone(v.impact)),
    },
    { label: "Type", value: v.type || "—" },
    {
      label: "Requestor",
      value: v.requestor.trim() || "Not recorded",
      tone: v.requestor.trim() ? "neutral" : "warn",
    },
  ];

  const timing: DetailFact[] = [
    {
      label: "Scheduled",
      value: v.scheduledDate ? formatDate(v.scheduledDate) : "—",
      tone: upcoming ? dueTone(slot.state) : "neutral",
      hint: upcoming && v.scheduledDate ? slot.label : undefined,
    },
    {
      label: "Window",
      value: v.startTime && v.endTime ? `${v.startTime} – ${v.endTime}` : "Not set",
      tone: v.startTime && v.endTime ? "neutral" : "warn",
      hint: v.startTime && v.endTime ? durationLabel(v.startTime, v.endTime) : undefined,
    },
  ];

  const scope: DetailFact[] = [
    { label: "Application", value: appName ?? "All applications" },
    { label: "Environment", value: v.environmentName || "—" },
    { label: "Department", value: v.departmentName || "—" },
  ];

  return (
    <EditableDetailShell
      pageTitle="Maintenance Detail"
      pageDescription="Scheduled outage or change window on an application environment — approval status, window times, and impact show whether releases must avoid that slot."
      entityLabel="Maintenance"
      entityCode={row.maintenanceCode}
      entityName={v.type || row.maintenanceCode}
      selectLabel="Select Maintenance"
      selectValue={row.id}
      selectOptions={selectOptions}
      onSelectChange={(next) => next !== row.id && router.push(`/planned-maintenance/${next}`)}
      lastRefresh={lastRefresh}
      footer="Maintenance Page v2.0 · Planned Maintenance · Maintenance ID is locked"
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
      lockedIdLabel="Maintenance ID"
      successChanges={edit.successChanges}
      onSuccessDismiss={edit.dismissSuccess}
      editForm={
        d ? (
          <EditableFieldGrid cols={2}>
            <EditableField
              label="Approval Status"
              value={d.approvalStatus}
              editing
              kind="select"
              options={approvalOptions}
              onChange={(n) => edit.setField("approvalStatus", n)}
            />
            <EditableField
              label="Type"
              value={d.type}
              editing
              onChange={(n) => edit.setField("type", n)}
              placeholder="e.g. Patch, Upgrade…"
            />
            <EditableField
              label="Impact"
              value={d.impact}
              editing
              onChange={(n) => edit.setField("impact", n)}
              placeholder="e.g. Medium…"
            />
            <EditableField
              label="Scheduled Date"
              value={d.scheduledDate}
              editing
              kind="date"
              onChange={(n) => edit.setField("scheduledDate", n)}
            />
            <EditableField
              label="Start Time"
              value={d.startTime}
              editing
              mono
              onChange={(n) => edit.setField("startTime", n)}
              placeholder="HH:MM"
            />
            <EditableField
              label="End Time"
              value={d.endTime}
              editing
              mono
              onChange={(n) => edit.setField("endTime", n)}
              placeholder="HH:MM"
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
              label="Environment"
              value={d.environmentName}
              editing
              mono
              onChange={(n) => edit.setField("environmentName", n)}
              placeholder="e.g. Prod…"
            />
            <EditableField
              label="Department"
              value={d.departmentName}
              editing
              onChange={(n) => edit.setField("departmentName", n)}
              placeholder="Department…"
            />
            <EditableField
              label="Requestor"
              value={d.requestor}
              editing
              onChange={(n) => edit.setField("requestor", n)}
              placeholder="Requestor name…"
            />
            <EditableField
              label="Notes"
              value={d.notes}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("notes", n)}
              placeholder="Maintenance notes…"
              className="sm:col-span-2"
            />
          </EditableFieldGrid>
        ) : null
      }
      relatedLinks={
        <>
          <ProgressLink href="/calendar" className={taBtnSecondary + " text-sm !py-2"}>
            <Calendar className="mr-1.5 inline h-4 w-4" aria-hidden />
            View Calendar
          </ProgressLink>
          <ProgressLink href="/releases" className={taBtnSecondary + " text-sm !py-2"}>
            <Package className="mr-1.5 inline h-4 w-4" aria-hidden />
            Releases
          </ProgressLink>
          <ProgressLink href="/planned-maintenance" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            All Maintenance
          </ProgressLink>
        </>
      }
    >
      <DetailDecisionHeader
        status={{
          label: v.approvalStatus,
          tone: approvalTone(v.approvalStatus),
          caption: cancelled
            ? "Slot will not run"
            : windowDone
              ? "Window complete"
              : `${v.type || "Maintenance"} on ${v.environmentName || "this environment"} · ${slot.label.toLowerCase()}`,
        }}
        signals={signals}
        primaryAction={workflow.primary ? toAction(workflow.primary) : null}
        secondaryActions={workflow.secondary.map(toAction)}
        canEdit={canEdit}
        actionError={stepError}
        attention={attention}
        attentionClearLabel={
          windowDone
            ? "Window complete — nothing outstanding"
            : "Window is approved and fully specified"
        }
        timing={timing}
        scope={scope}
      />

      <DetailSection
        icon={Calendar}
        tone="violet"
        title="Maintenance window"
        description="Start → maintenance → end derived from the scheduled date and clock times."
      >
        <EntityTimeline
          phases={[
            {
              label: "Start",
              detail: windowLabel(v.scheduledDate, v.startTime),
              complete: windowDone || windowActive,
              tone: "amber",
            },
            {
              label: "Maintenance",
              detail: `${v.type || "Window"} · ${durationLabel(v.startTime, v.endTime)}`,
              active: windowActive && !windowDone,
              complete: windowDone,
              tone: "violet",
            },
            {
              label: "End",
              detail: windowLabel(v.scheduledDate, v.endTime),
              complete: windowDone,
              tone: "emerald",
            },
          ]}
        />
      </DetailSection>

      <DetailSection
        icon={FileText}
        tone="indigo"
        title="Notes"
        description="Context for CAB, env owners, and teams that must avoid this slot."
      >
        <TintedCallout tone="amber">
          {v.notes.trim() ? v.notes : "No notes recorded yet."}
        </TintedCallout>
      </DetailSection>
    </EditableDetailShell>
  );
}
