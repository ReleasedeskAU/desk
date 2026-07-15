"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  AppWindow,
  FileText,
  List,
  Package,
  ShieldAlert,
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

const SEVERITY_OPTIONS = ["P1", "P2", "P3"].map((v) => ({ value: v, label: v }));

const STATUS_OPTIONS = ["Active", "Investigating", "Mitigated", "Resolved", "Closed"].map(
  (v) => ({ value: v, label: v })
);

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
  if (s.includes("active") || s.includes("open")) return "bad";
  if (s.includes("investigat") || s.includes("mitigat") || s.includes("progress")) return "warn";
  if (s.includes("resolv") || s.includes("closed")) return "good";
  return "neutral";
}

function impactTone(impact: string): ChipTone {
  const s = impact.toLowerCase();
  if (s.includes("critical") || s.includes("high")) return "bad";
  if (s.includes("medium")) return "warn";
  if (s.includes("low")) return "good";
  return "neutral";
}

function heroToneFromSeverity(severity: string): "rose" | "amber" | "emerald" | "sky" {
  const t = severityTone(severity);
  if (t === "bad") return "rose";
  if (t === "warn") return "amber";
  if (t === "good") return "emerald";
  return "sky";
}

/** Rough clearance progress from status for the hero ring. */
function statusPercent(status: string): number {
  const s = status.toLowerCase();
  if (s.includes("closed") || s.includes("resolv")) return 100;
  if (s.includes("mitigat")) return 70;
  if (s.includes("investigat")) return 45;
  if (s.includes("active") || s.includes("open")) return 20;
  return 35;
}

function impactPercent(impact: string): number {
  const t = impactTone(impact);
  if (t === "bad") return 90;
  if (t === "warn") return 55;
  if (t === "good") return 25;
  return 40;
}

function isResolved(status: string): boolean {
  return /resolved|closed/i.test(status);
}

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
  const [row, setRow] = useState<IncidentDetail | null>(null);
  const [options, setOptions] = useState<IncidentOption[]>([]);
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

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
    // incidentCode is immutable — never include it in PATCH.
    const res = await safeFetchJson(`/api/incidents/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
      label: "incident-patch",
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
      {edit.error && <TintedCallout tone="rose">{edit.error}</TintedCallout>}

      <HeroStatusRow
        hero={{
          icon: ShieldAlert,
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
          icon: AlertTriangle,
          label: "Impact",
          percent: resolved ? 100 : impactPercent(v.impact),
          caption: v.impact || "impact not set",
          tone: resolved ? "emerald" : heroToneFromSeverity(v.severity),
        }}
      />

      <DetailSection
        icon={AlertTriangle}
        tone="rose"
        title="Incident status"
        description="How severe this outage is and whether it has cleared enough for related releases to proceed."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusChip
            label={resolved ? "✓ CLEARED" : "⚠️ INCIDENT OPEN"}
            tone={resolved ? "good" : "bad"}
          />
          <StatusChip label={v.severity} tone={severityTone(v.severity)} />
          <StatusChip label={v.status} tone={statusTone(v.status)} />
          <StatusChip label={v.impact} tone={impactTone(v.impact)} />
        </div>
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Incident ID" value={row.incidentCode} />
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
            label="Impact"
            value={v.impact}
            editing={edit.editing}
            onChange={(n) => edit.setField("impact", n)}
            display={<StatusChip label={v.impact} tone={impactTone(v.impact)} />}
            placeholder="e.g. High…"
          />
          <EditableField
            label="Title"
            value={v.title}
            editing={edit.editing}
            onChange={(n) => edit.setField("title", n)}
            placeholder="Incident title…"
          />
        </EditableFieldGrid>
      </DetailSection>

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
              detail: resolved ? "Marked resolved" : `Clearance ${statusPercent(v.status)}%`,
              complete: resolved,
              tone: "emerald",
            },
          ]}
        />
        <div className="mt-4">
          <EditableFieldGrid>
            <EditableField
              label="Created"
              value={v.timestamp}
              editing={edit.editing}
              kind="date"
              onChange={(n) => edit.setField("timestamp", n)}
              display={v.timestamp ? formatDate(v.timestamp) : "—"}
            />
          </EditableFieldGrid>
        </div>
      </DetailSection>

      <DetailSection
        icon={AppWindow}
        tone="sky"
        title="Application & environment"
        description="Where the incident hit — application, department, and environment."
      >
        <EditableFieldGrid>
          <EditableField
            label="Application"
            value={v.applicationId}
            editing={edit.editing}
            kind="select"
            options={applicationOptions}
            onChange={(n) => edit.setField("applicationId", n)}
            display={appName}
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
        </EditableFieldGrid>
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
        <EditableFieldGrid>
          <EditableField
            label="Related Release"
            value={v.relatedReleaseCode}
            editing={edit.editing}
            kind="select"
            options={releaseCodeOptions}
            onChange={(n) => edit.setField("relatedReleaseCode", n)}
            mono
            display={
              row.relatedRelease && row.relatedRelease.releaseCode === relatedCode ? (
                <ProgressLink
                  href={`/releases/${row.relatedRelease.id}`}
                  className="font-mono text-[13.5px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
                >
                  {relatedCode}
                </ProgressLink>
              ) : relatedCode ? (
                relatedCode
              ) : (
                "—"
              )
            }
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={User}
        tone="emerald"
        title="Assignment"
        description="Who owns clearing this incident before related releases can proceed."
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
