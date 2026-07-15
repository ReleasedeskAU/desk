"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  AppWindow,
  Calendar,
  CheckCircle2,
  FileText,
  List,
  Package,
  User,
  Wrench,
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
  EntityTimeline,
  EntityConnection,
  type ChipTone,
} from "@/components/detail/editable";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";

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

function heroToneFromApproval(status: string): "rose" | "amber" | "emerald" | "sky" {
  const t = approvalTone(status);
  if (t === "bad") return "rose";
  if (t === "warn") return "amber";
  if (t === "good") return "emerald";
  return "sky";
}

function impactPercent(impact: string): number {
  const t = impactTone(impact);
  if (t === "bad") return 90;
  if (t === "warn") return 55;
  if (t === "good") return 25;
  return 40;
}

function approvalPercent(status: string): number {
  const s = status.toLowerCase();
  if (s.includes("complete")) return 100;
  if (s.includes("approv") || s.includes("progress")) return 70;
  if (s.includes("schedul")) return 50;
  if (s.includes("pending")) return 30;
  if (s.includes("cancel") || s.includes("reject")) return 0;
  return 40;
}

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
    edit.discard();
    edit.setSaveMessage("Saved");
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
  const showConnection = Boolean(v.applicationId && appName);
  const windowActive = /approv|schedul|progress/i.test(v.approvalStatus);
  const windowDone = /complete/i.test(v.approvalStatus);
  const cancelled = /cancel|reject/i.test(v.approvalStatus);

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
      {edit.error && <TintedCallout tone="rose">{edit.error}</TintedCallout>}

      <HeroStatusRow
        hero={{
          icon: CheckCircle2,
          label: "Approval",
          value: v.approvalStatus,
          tone: heroToneFromApproval(v.approvalStatus),
        }}
        secondary={{
          icon: Wrench,
          label: "Type",
          value: v.type || "—",
        }}
        metric={{
          icon: AlertTriangle,
          label: "Impact",
          percent: cancelled ? 0 : windowDone ? 100 : impactPercent(v.impact),
          caption: v.impact || "impact not set",
          tone: cancelled
            ? "rose"
            : windowDone
              ? "emerald"
              : impactTone(v.impact) === "bad"
                ? "rose"
                : impactTone(v.impact) === "warn"
                  ? "amber"
                  : "sky",
        }}
      />

      <DetailSection
        icon={Wrench}
        tone="amber"
        title="Maintenance status"
        description="Approval state, type, and impact — whether releases should avoid this slot."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusChip
            label={
              cancelled
                ? "✗ CANCELLED"
                : windowDone
                  ? "✓ COMPLETE"
                  : windowActive
                    ? "📅 SCHEDULED"
                    : v.approvalStatus.toUpperCase()
            }
            tone={approvalTone(v.approvalStatus)}
          />
          <StatusChip label={v.approvalStatus} tone={approvalTone(v.approvalStatus)} />
          <StatusChip label={v.impact} tone={impactTone(v.impact)} />
        </div>
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Maintenance ID" value={row.maintenanceCode} />
          <EditableField
            label="Approval Status"
            value={v.approvalStatus}
            editing={edit.editing}
            kind="select"
            options={approvalOptions}
            onChange={(n) => edit.setField("approvalStatus", n)}
            display={
              <StatusChip label={v.approvalStatus} tone={approvalTone(v.approvalStatus)} />
            }
          />
          <EditableField
            label="Type"
            value={v.type}
            editing={edit.editing}
            onChange={(n) => edit.setField("type", n)}
            placeholder="e.g. Patch, Upgrade…"
          />
          <EditableField
            label="Impact"
            value={v.impact}
            editing={edit.editing}
            onChange={(n) => edit.setField("impact", n)}
            display={<StatusChip label={v.impact} tone={impactTone(v.impact)} />}
            placeholder="e.g. Medium…"
          />
        </EditableFieldGrid>
      </DetailSection>

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
        <div className="mt-4">
          <EditableFieldGrid cols={3}>
            <EditableField
              label="Scheduled Date"
              value={v.scheduledDate}
              editing={edit.editing}
              kind="date"
              onChange={(n) => edit.setField("scheduledDate", n)}
              display={v.scheduledDate ? formatDate(v.scheduledDate) : "—"}
            />
            <EditableField
              label="Start Time"
              value={v.startTime}
              editing={edit.editing}
              onChange={(n) => edit.setField("startTime", n)}
              placeholder="HH:MM"
              mono
            />
            <EditableField
              label="End Time"
              value={v.endTime}
              editing={edit.editing}
              onChange={(n) => edit.setField("endTime", n)}
              placeholder="HH:MM"
              mono
            />
            <EditableField
              label="Duration"
              value={durationLabel(v.startTime, v.endTime)}
              editing={false}
              display={durationLabel(v.startTime, v.endTime)}
            />
          </EditableFieldGrid>
        </div>
      </DetailSection>

      <DetailSection
        icon={AppWindow}
        tone="sky"
        title="Affected systems"
        description="Application and environment this outage window covers."
      >
        {showConnection && appName && (
          <div className="mb-4">
            <EntityConnection
              source={appName}
              target={v.environmentName || "—"}
              caption={
                approvalPercent(v.approvalStatus) === 100
                  ? "Window complete"
                  : `Approval · ${v.approvalStatus}`
              }
            />
          </div>
        )}
        <EditableFieldGrid>
          <EditableField
            label="Application"
            value={v.applicationId}
            editing={edit.editing}
            kind="select"
            options={applicationOptions}
            onChange={(n) => edit.setField("applicationId", n)}
            display={appName ?? "—"}
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
            label="Department"
            value={v.departmentName}
            editing={edit.editing}
            onChange={(n) => edit.setField("departmentName", n)}
            placeholder="Department…"
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={User}
        tone="emerald"
        title="Requestor"
        description="Who requested this maintenance window."
      >
        <EditableFieldGrid>
          <EditableField
            label="Requestor"
            value={v.requestor}
            editing={edit.editing}
            onChange={(n) => edit.setField("requestor", n)}
            placeholder="Requestor name…"
          />
        </EditableFieldGrid>
        {!edit.editing && !v.requestor.trim() && (
          <div className="mt-3">
            <TintedCallout tone="amber">No requestor recorded yet.</TintedCallout>
          </div>
        )}
      </DetailSection>

      <DetailSection
        icon={FileText}
        tone="indigo"
        title="Notes"
        description="Context for CAB, env owners, and teams that must avoid this slot."
      >
        {edit.editing ? (
          <EditableField
            label="Notes"
            value={v.notes}
            editing
            kind="textarea"
            onChange={(n) => edit.setField("notes", n)}
            placeholder="Maintenance notes…"
          />
        ) : (
          <TintedCallout tone="amber">
            {v.notes.trim() ? v.notes : "No notes recorded yet."}
          </TintedCallout>
        )}
      </DetailSection>
    </EditableDetailShell>
  );
}
