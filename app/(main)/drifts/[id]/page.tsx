"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  FileText,
  List,
  Package,
  Server,
  Wrench,
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
  ScoreBar,
  EntityTimeline,
  type ChipTone,
} from "@/components/detail/editable";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";

type DriftDetail = {
  id: string;
  driftCode: string;
  releaseId: string;
  applicationId: string;
  departmentName: string | null;
  environmentName: string;
  driftType: string;
  driftCategory: string | null;
  detectedDate: string;
  severity: string;
  description: string;
  impactOnRelease: string | null;
  remediationAction: string | null;
  status: string;
  etaToFix: string | null;
  release: { id: string; releaseCode: string; name: string; status: string };
  application: { id: string; name: string };
};

type DriftOption = { id: string; driftCode: string };
type ReleaseOption = { id: string; releaseCode: string };
type ApplicationOption = { id: string; name: string };

type DriftDraft = {
  releaseId: string;
  applicationId: string;
  departmentName: string;
  environmentName: string;
  driftType: string;
  driftCategory: string;
  detectedDate: string;
  severity: string;
  description: string;
  impactOnRelease: string;
  remediationAction: string;
  status: string;
  etaToFix: string;
};

const DRIFT_FIELD_LABELS: Partial<Record<keyof DriftDraft, string>> = {
  releaseId: "Release",
  applicationId: "Application",
  departmentName: "Department",
  environmentName: "Environment",
  driftType: "Drift Type",
  driftCategory: "Drift Category",
  detectedDate: "Detected Date",
  severity: "Severity",
  description: "Description",
  impactOnRelease: "Impact on Release",
  remediationAction: "Remediation Action",
  status: "Status",
  etaToFix: "ETA to Fix",
};

function toDateInput(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function daysSinceDetected(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function severityTone(severity: string): ChipTone {
  const s = severity.toLowerCase();
  if (s.includes("critical") || s.includes("high")) return "bad";
  if (s.includes("medium")) return "warn";
  if (s.includes("low")) return "good";
  return "neutral";
}

function statusTone(status: string): ChipTone {
  const s = status.toLowerCase();
  if (s.includes("open")) return "warn";
  if (s.includes("progress")) return "info";
  if (s.includes("resolv") || s.includes("closed") || s.includes("fixed")) return "good";
  return "neutral";
}

function heroToneFromSeverity(severity: string): "rose" | "amber" | "emerald" | "sky" {
  const t = severityTone(severity);
  if (t === "bad") return "rose";
  if (t === "warn") return "amber";
  if (t === "good") return "emerald";
  return "sky";
}

function toDraft(row: DriftDetail): DriftDraft {
  return {
    releaseId: row.releaseId,
    applicationId: row.applicationId,
    departmentName: row.departmentName ?? "",
    environmentName: row.environmentName,
    driftType: row.driftType,
    driftCategory: row.driftCategory ?? "",
    detectedDate: toDateInput(row.detectedDate),
    severity: row.severity,
    description: row.description,
    impactOnRelease: row.impactOnRelease ?? "",
    remediationAction: row.remediationAction ?? "",
    status: row.status,
    etaToFix: toDateInput(row.etaToFix),
  };
}

const SEVERITY_OPTIONS = ["Critical", "High", "Medium", "Low"].map((v) => ({
  value: v,
  label: v,
}));

const STATUS_OPTIONS = ["Open", "In Progress", "Resolved", "Closed"].map((v) => ({
  value: v,
  label: v,
}));

export default function DriftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<DriftDetail | null>(null);
  const [options, setOptions] = useState<DriftOption[]>([]);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, releaseList, appList, me] = await Promise.all([
      safeFetchJson<DriftDetail>(`/api/drifts/${id}`, {
        signal,
        label: "drift-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<DriftOption[]>("/api/drifts", { signal, label: "drifts-list" }),
      safeFetchJson<ReleaseOption[]>("/api/releases", { signal, label: "releases-list" }),
      safeFetchJson<ApplicationOption[]>("/api/applications", {
        signal,
        label: "applications-list",
      }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(list.ok ? list.data.map((d) => ({ id: d.id, driftCode: d.driftCode })) : []);
    setReleases(
      releaseList.ok ? releaseList.data.map((r) => ({ id: r.id, releaseCode: r.releaseCode })) : []
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
        .sort((a, b) => a.driftCode.localeCompare(b.driftCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.driftCode })),
    [options]
  );

  const releaseOptions = useMemo(() => {
    const opts = [...releases]
      .sort((a, b) => a.releaseCode.localeCompare(b.releaseCode, undefined, { numeric: true }))
      .map((r) => ({ value: r.id, label: r.releaseCode }));
    if (row?.releaseId && !opts.some((o) => o.value === row.releaseId)) {
      opts.unshift({
        value: row.releaseId,
        label: row.release?.releaseCode ?? row.releaseId,
      });
    }
    return opts;
  }, [releases, row?.releaseId, row?.release?.releaseCode]);

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
    const res = await safeFetchJson(`/api/drifts/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseId: d.releaseId,
        applicationId: d.applicationId,
        departmentName: d.departmentName || null,
        environmentName: d.environmentName,
        driftType: d.driftType,
        driftCategory: d.driftCategory || null,
        detectedDate: d.detectedDate,
        severity: d.severity,
        description: d.description,
        impactOnRelease: d.impactOnRelease || null,
        remediationAction: d.remediationAction || null,
        status: d.status,
        etaToFix: d.etaToFix || null,
      }),
      label: "drift-patch",
      rejectHttpErrors: false,
    });
    edit.setSaving(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t save changes. Try again.");
      return;
    }
    edit.completeSaveSuccess(DRIFT_FIELD_LABELS);
    await load();
  };

  const remove = async () => {
    if (!row) return;
    edit.setDeleting(true);
    const res = await safeFetchJson(`/api/drifts/${row.id}`, {
      method: "DELETE",
      label: "drift-delete",
      rejectHttpErrors: false,
    });
    edit.setDeleting(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t delete this drift.");
      edit.setDeleteOpen(false);
      return;
    }
    router.push("/drifts");
  };

  if (loading) return <p className="text-slate-500 dark:text-white/60">Loading drift…</p>;
  if (!row || !v) return <p className="text-slate-500 dark:text-white/60">Drift not found.</p>;

  const daysOpen = daysSinceDetected(v.detectedDate || row.detectedDate);
  const urgencyPct = Math.max(0, Math.min(100, (Math.min(daysOpen, 30) / 30) * 100));
  const resolved = /resolv|closed|fixed/i.test(v.status);
  const selectedRelease = releases.find((r) => r.id === v.releaseId);
  const selectedApp = applications.find((a) => a.id === v.applicationId);

  return (
    <EditableDetailShell
      pageTitle="Drift Detail"
      pageDescription="Environment or config mismatch against the intended release baseline — severity and days since detection show how urgently remediation must land before go-live."
      entityLabel="Drift"
      entityCode={row.driftCode}
      entityName={v.driftType || row.driftCode}
      selectLabel="Select Drift"
      selectValue={row.id}
      selectOptions={selectOptions}
      onSelectChange={(next) => next !== row.id && router.push(`/drifts/${next}`)}
      lastRefresh={lastRefresh}
      footer="Drift Page v2.0 · Environment & config drift · Drift ID is locked"
      editing={edit.editing}
      canEdit={canEdit}
      saving={edit.saving}
      deleting={edit.deleting}
      editError={edit.error}
      onEdit={edit.startEdit}
      onDiscard={edit.discard}
      onSave={save}
      deleteOpen={edit.deleteOpen}
      onDeleteOpen={() => edit.setDeleteOpen(true)}
      onDeleteCancel={() => edit.setDeleteOpen(false)}
      onDeleteConfirm={remove}
      lockedIdLabel="Drift ID"
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
              label="Detected Date"
              value={d.detectedDate}
              editing
              kind="date"
              onChange={(n) => edit.setField("detectedDate", n)}
            />
            <EditableField
              label="ETA to Fix"
              value={d.etaToFix}
              editing
              kind="date"
              onChange={(n) => edit.setField("etaToFix", n)}
            />
            <EditableField
              label="Release"
              value={d.releaseId}
              editing
              kind="select"
              options={releaseOptions}
              onChange={(n) => edit.setField("releaseId", n)}
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
            />
            <EditableField
              label="Drift Type"
              value={d.driftType}
              editing
              onChange={(n) => edit.setField("driftType", n)}
            />
            <EditableField
              label="Drift Category"
              value={d.driftCategory}
              editing
              onChange={(n) => edit.setField("driftCategory", n)}
              placeholder="Category…"
            />
            <EditableField
              label="Description"
              value={d.description}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("description", n)}
              placeholder="What drifted…"
              className="sm:col-span-2"
            />
            <EditableField
              label="Impact on Release"
              value={d.impactOnRelease}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("impactOnRelease", n)}
              placeholder="Impact on go-live…"
              className="sm:col-span-2"
            />
            <EditableField
              label="Remediation Action"
              value={d.remediationAction}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("remediationAction", n)}
              placeholder="How this drift will be fixed…"
              className="sm:col-span-2"
            />
          </EditableFieldGrid>
        ) : null
      }
      relatedLinks={
        <>
          <ProgressLink
            href={`/releases/${v.releaseId || row.release.id}`}
            className={taBtnSecondary + " text-sm !py-2"}
          >
            <Package className="mr-1.5 inline h-4 w-4" aria-hidden />
            View Release
          </ProgressLink>
          <ProgressLink href="/environments" className={taBtnSecondary + " text-sm !py-2"}>
            <Server className="mr-1.5 inline h-4 w-4" aria-hidden />
            View Env
          </ProgressLink>
          <ProgressLink href="/drifts" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            All Drifts
          </ProgressLink>
        </>
      }
    >
      <HeroStatusRow
        hero={{
          icon: AlertTriangle,
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
          icon: Calendar,
          label: "Urgency",
          percent: urgencyPct,
          caption: resolved
            ? "remediation complete"
            : `${daysOpen} day${daysOpen === 1 ? "" : "s"} open`,
          tone: resolved ? "emerald" : daysOpen > 14 ? "rose" : "amber",
        }}
      />

      <DetailSection
        icon={AlertTriangle}
        tone="rose"
        title="Drift status"
        description="How severe the mismatch is, whether it’s still open, and how long it has been outstanding."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusChip
            label={resolved ? "✓ CLEARED" : "⚠️ DRIFT OPEN"}
            tone={resolved ? "good" : "bad"}
          />
          <StatusChip label={v.severity} tone={severityTone(v.severity)} />
          <StatusChip label={v.status} tone={statusTone(v.status)} />
        </div>
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Drift ID" value={row.driftCode} />
          <EditableField
            label="Severity"
            value={v.severity}
            editing={false}
            display={<StatusChip label={v.severity} tone={severityTone(v.severity)} />}
          />
          <EditableField
            label="Status"
            value={v.status}
            editing={false}
            display={<StatusChip label={v.status} tone={statusTone(v.status)} />}
          />
        </EditableFieldGrid>
        <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5">
          <ScoreBar
            value={Math.min(daysOpen, 30)}
            max={30}
            label={`${daysOpen} day${daysOpen === 1 ? "" : "s"} since detected`}
          />
        </div>
      </DetailSection>

      <DetailSection
        icon={Calendar}
        tone="violet"
        title="Resolution timeline"
        description="Detected → current state → target fix — the path from mismatch to baseline restore."
      >
        <EntityTimeline
          phases={[
            {
              label: "Detected",
              detail: v.detectedDate ? formatDate(v.detectedDate) : "—",
              complete: true,
              tone: "rose",
            },
            {
              label: "Current",
              detail: v.status,
              active: !resolved,
              complete: resolved,
              tone: severityTone(v.severity) === "bad" ? "rose" : "amber",
            },
            {
              label: "Target Fix",
              detail: v.etaToFix ? formatDate(v.etaToFix) : "No ETA recorded",
              tone: "emerald",
            },
          ]}
        />
        <div className="mt-4">
          <EditableFieldGrid>
            <EditableField
              label="Detected Date"
              value={v.detectedDate}
              editing={false}
              display={v.detectedDate ? formatDate(v.detectedDate) : "—"}
            />
            <EditableField
              label="ETA to Fix"
              value={v.etaToFix}
              editing={false}
              display={v.etaToFix ? formatDate(v.etaToFix) : "—"}
            />
          </EditableFieldGrid>
        </div>
      </DetailSection>

      <DetailSection
        icon={Package}
        tone="sky"
        title="Associated release"
        description="Which release and application this drift threatens."
      >
        <EditableFieldGrid>
          <EditableField
            label="Release"
            value={v.releaseId}
            editing={false}
            display={
              <ProgressLink
                href={`/releases/${v.releaseId || row.release.id}`}
                className="font-mono text-[13.5px] font-semibold text-sky-600 hover:underline dark:text-sky-300"
              >
                {selectedRelease?.releaseCode ?? row.release.releaseCode}
              </ProgressLink>
            }
          />
          <EditableField
            label="Release Name"
            value={row.release.name}
            editing={false}
            display={
              v.releaseId === row.releaseId
                ? row.release.name
                : (selectedRelease?.releaseCode ?? "—")
            }
          />
          <EditableField
            label="Application"
            value={v.applicationId}
            editing={false}
            display={selectedApp?.name ?? row.application.name}
          />
          <EditableField label="Department" value={v.departmentName} editing={false} />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={Server}
        tone="amber"
        title="Environment details"
        description="Where the mismatch was found and what kind of drift it is."
      >
        <EditableFieldGrid>
          <EditableField
            label="Environment"
            value={v.environmentName}
            editing={false}
            mono
          />
          <EditableField label="Drift Type" value={v.driftType} editing={false} />
          <EditableField label="Drift Category" value={v.driftCategory} editing={false} />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={FileText}
        tone="violet"
        title="Description & impact"
        description="What diverged from baseline and how it affects the release window."
      >
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
              Description
            </p>
            <TintedCallout tone="amber">
              {v.description.trim() || "No description recorded."}
            </TintedCallout>
          </div>
          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
              Impact on Release
            </p>
            <TintedCallout tone="rose">
              {v.impactOnRelease.trim() || "No release impact recorded."}
            </TintedCallout>
          </div>
        </div>
      </DetailSection>

      <DetailSection
        icon={Wrench}
        tone="emerald"
        title="Remediation"
        description="The action plan to restore the environment to the intended baseline."
      >
        <TintedCallout tone="emerald">
          {v.remediationAction.trim() || "No remediation action recorded yet."}
        </TintedCallout>
      </DetailSection>
    </EditableDetailShell>
  );
}
