"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, FileText, List, Package, Server, Wrench } from "lucide-react";
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
import { driftWorkflow, type WorkflowStep } from "@/lib/entity-workflow";

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
type DepartmentOption = { id: string; name: string };
type ApplicationOption = { id: string; name: string; departmentId: string };
type EnvironmentOption = { id: string; name: string; applicationId: string };
type ReleaseOption = {
  id: string;
  releaseCode: string;
  departmentId: string;
  applications: { application: { id: string } }[];
};
type ReferenceOption = { id: string; value: string; active?: boolean };

type DriftDraft = {
  departmentId: string;
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
  departmentId: "Department",
  releaseId: "Release",
  applicationId: "Application",
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

/** A drift open past this many days needs escalation rather than more waiting. */
const AGEING_DRIFT_DAYS = 14;

function toDraft(
  row: DriftDetail,
  departments: DepartmentOption[],
  applications: ApplicationOption[],
): DriftDraft {
  const app = applications.find((a) => a.id === row.applicationId);
  const dept =
    departments.find((d) => d.name === row.departmentName) ??
    departments.find((d) => d.id === app?.departmentId);
  return {
    departmentId: dept?.id ?? app?.departmentId ?? "",
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

const STATUS_OPTIONS = [
  "Detected",
  "Investigating",
  "Approved",
  "Reverted",
  "Escalated",
].map((v) => ({
  value: v,
  label: v,
}));

export default function DriftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<DriftDetail | null>(null);
  const [options, setOptions] = useState<DriftOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentOption[]>([]);
  const [driftTypes, setDriftTypes] = useState<ReferenceOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  /** Id of the workflow step currently being written, so its button can spin. */
  const [pendingStep, setPendingStep] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, deptList, releaseList, appList, envList, typeList, me] = await Promise.all([
      safeFetchJson<DriftDetail>(`/api/drifts/${id}`, {
        signal,
        label: "drift-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<DriftOption[]>("/api/drifts", { signal, label: "drifts-list" }),
      safeFetchJson<DepartmentOption[]>("/api/departments", { signal, label: "departments-list" }),
      safeFetchJson<ReleaseOption[]>("/api/releases", { signal, label: "releases-list" }),
      safeFetchJson<ApplicationOption[]>("/api/applications", {
        signal,
        label: "applications-list",
      }),
      safeFetchJson<EnvironmentOption[]>("/api/environments", {
        signal,
        label: "environments-list",
      }),
      safeFetchJson<ReferenceOption[]>("/api/reference-data?category=drift_type", {
        signal,
        label: "drift-types",
      }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(list.ok ? list.data.map((d) => ({ id: d.id, driftCode: d.driftCode })) : []);
    setDepartments(deptList.ok ? deptList.data.map((d) => ({ id: d.id, name: d.name })) : []);
    setReleases(
      releaseList.ok
        ? releaseList.data.map((r) => ({
            id: r.id,
            releaseCode: r.releaseCode,
            departmentId: r.departmentId,
            applications: Array.isArray(r.applications) ? r.applications : [],
          }))
        : [],
    );
    setApplications(
      appList.ok
        ? appList.data.map((a) => ({ id: a.id, name: a.name, departmentId: a.departmentId }))
        : [],
    );
    setEnvironments(
      envList.ok
        ? envList.data.map((e) => ({ id: e.id, name: e.name, applicationId: e.applicationId }))
        : [],
    );
    setDriftTypes(
      typeList.ok ? typeList.data.filter((item) => item.active !== false) : [],
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

  const source = useMemo(
    () => (row ? toDraft(row, departments, applications) : null),
    [row, departments, applications],
  );
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

  const departmentOptions = useMemo(
    () =>
      [...departments]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((dept) => ({ value: dept.id, label: dept.name })),
    [departments],
  );

  const filteredApplications = useMemo(() => {
    const deptId = d?.departmentId ?? v?.departmentId ?? "";
    return applications.filter((a) => a.departmentId === deptId);
  }, [applications, d?.departmentId, v?.departmentId]);

  const applicationOptions = useMemo(() => {
    const opts = [...filteredApplications]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => ({ value: a.id, label: a.name }));
    const appId = d?.applicationId ?? row?.applicationId;
    if (appId && !opts.some((o) => o.value === appId)) {
      opts.unshift({
        value: appId,
        label: applications.find((a) => a.id === appId)?.name ?? row?.application?.name ?? appId,
      });
    }
    return opts;
  }, [filteredApplications, applications, d?.applicationId, row?.applicationId, row?.application?.name]);

  const filteredReleases = useMemo(() => {
    const deptId = d?.departmentId ?? v?.departmentId ?? "";
    const appId = d?.applicationId ?? v?.applicationId ?? "";
    return releases.filter(
      (r) =>
        r.departmentId === deptId &&
        r.applications.some((link) => link.application.id === appId),
    );
  }, [releases, d?.departmentId, d?.applicationId, v?.departmentId, v?.applicationId]);

  const releaseOptions = useMemo(() => {
    const opts = [...filteredReleases]
      .sort((a, b) => a.releaseCode.localeCompare(b.releaseCode, undefined, { numeric: true }))
      .map((r) => ({ value: r.id, label: r.releaseCode }));
    const releaseId = d?.releaseId ?? row?.releaseId;
    if (releaseId && !opts.some((o) => o.value === releaseId)) {
      opts.unshift({
        value: releaseId,
        label: releases.find((r) => r.id === releaseId)?.releaseCode ?? row?.release?.releaseCode ?? releaseId,
      });
    }
    return opts;
  }, [filteredReleases, releases, d?.releaseId, row?.releaseId, row?.release?.releaseCode]);

  const environmentOptions = useMemo(() => {
    const appId = d?.applicationId ?? v?.applicationId ?? "";
    const opts = environments
      .filter((e) => e.applicationId === appId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => ({ value: e.name, label: e.name }));
    const envName = d?.environmentName ?? row?.environmentName;
    if (envName && !opts.some((o) => o.value === envName)) {
      opts.unshift({ value: envName, label: envName });
    }
    return opts;
  }, [environments, d?.applicationId, d?.environmentName, v?.applicationId, row?.environmentName]);

  const driftTypeOptions = useMemo(() => {
    const opts = [...driftTypes]
      .sort((a, b) => a.value.localeCompare(b.value))
      .map((t) => ({ value: t.value, label: t.value }));
    if (row?.driftType && !opts.some((o) => o.value === row.driftType)) {
      opts.unshift({ value: row.driftType, label: row.driftType });
    }
    return opts;
  }, [driftTypes, row?.driftType]);

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
    const draft = edit.draft;
    if (!draft.departmentId || !draft.applicationId || !draft.releaseId || !draft.environmentName || !draft.driftType) {
      edit.setSaving(false);
      edit.setError("Department, Application, Release, Environment, and Drift type are required.");
      return;
    }
    const res = await safeFetchJson(`/api/drifts/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseId: draft.releaseId,
        applicationId: draft.applicationId,
        environmentName: draft.environmentName,
        driftType: draft.driftType,
        driftCategory: draft.driftCategory || null,
        detectedDate: draft.detectedDate,
        severity: draft.severity,
        description: draft.description,
        impactOnRelease: draft.impactOnRelease || null,
        remediationAction: draft.remediationAction || null,
        status: draft.status,
        etaToFix: draft.etaToFix || null,
      }),
      label: "drift-patch",
      rejectHttpErrors: false,
    });
    edit.setSaving(false);
    if (!res.ok || res.status >= 300) {
      const message =
        res.ok && res.data && typeof res.data === "object" && "error" in res.data
          ? String((res.data as { error?: string }).error || "")
          : "";
      edit.setError(message || "Couldn’t save changes. Try again.");
      return;
    }
    edit.completeSaveSuccess(DRIFT_FIELD_LABELS);
    await load();
  };

  /**
   * Apply a one-click status transition from the decision header.
   * The API re-validates the status and enforces the editor role — this button
   * is convenience, not the permission check.
   */
  const applyStep = async (step: WorkflowStep) => {
    if (!row) return;
    setPendingStep(step.id);
    setStepError(null);
    const res = await safeFetchJson(`/api/drifts/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: step.status }),
      label: "drift-status-step",
      rejectHttpErrors: false,
    });
    setPendingStep(null);
    if (!res.ok || res.status >= 300) {
      setStepError(`Couldn’t set this drift to ${step.status}. Try again.`);
      return;
    }
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
  // Approved/Reverted are terminal lifecycle statuses on main (not just Resolved/Closed).
  const resolved = /approved|reverted|resolv|closed|fixed/i.test(v.status);
  const selectedRelease = releases.find((r) => r.id === v.releaseId);
  const selectedApp = applications.find((a) => a.id === v.applicationId);
  const selectedDept = departments.find((dept) => dept.id === v.departmentId);
  const etaDue = describeDue(v.etaToFix);
  const workflow = driftWorkflow(v.status);

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
      id: "eta-passed",
      when: !resolved && etaDue.state === "overdue",
      tone: "critical",
      label: `Fix ETA ${etaDue.label.toLowerCase()}`,
      detail: "The promised remediation date has passed and the environment still differs from baseline.",
    },
    {
      id: "severity",
      when: !resolved && severityTone(v.severity) === "bad",
      tone: "critical",
      label: `${v.severity} drift on ${v.environmentName || "this environment"}`,
      detail: "High-severity drift can invalidate testing done against the intended baseline.",
    },
    {
      id: "no-eta",
      when: !resolved && !v.etaToFix,
      tone: "warning",
      label: "No fix ETA",
      detail: "Nobody has committed to a date for restoring the baseline.",
    },
    {
      id: "no-remediation",
      when: !resolved && !v.remediationAction.trim(),
      tone: "warning",
      label: "No remediation plan",
    },
    {
      id: "ageing",
      when: !resolved && daysOpen > AGEING_DRIFT_DAYS,
      tone: "warning",
      label: `Open ${daysOpen} days`,
      detail: "Long-running drift usually means the baseline itself is out of date.",
    },
  ]);

  const signals: DetailFact[] = [
    {
      label: "Severity",
      value: v.severity || "—",
      tone: chipToneToFactTone(severityTone(v.severity)),
      hint: "How far the environment has diverged from the intended release baseline.",
    },
    {
      label: "Days open",
      value: String(daysOpen),
      tone: resolved ? "good" : daysOpen > AGEING_DRIFT_DAYS ? "bad" : "warn",
      hint: "Calendar days since the drift was detected.",
    },
  ];

  const timing: DetailFact[] = [
    { label: "Detected", value: v.detectedDate ? formatDate(v.detectedDate) : "—" },
    {
      label: "Fix ETA",
      value: v.etaToFix ? formatDate(v.etaToFix) : "Not set",
      tone: resolved ? "neutral" : dueTone(etaDue.state),
      hint: !resolved && v.etaToFix ? etaDue.label : undefined,
    },
  ];

  const scope: DetailFact[] = [
    {
      label: "Release",
      value: selectedRelease?.releaseCode ?? row.release.releaseCode,
      href: `/releases/${v.releaseId || row.release.id}`,
      hint: row.release.name,
    },
    { label: "Environment", value: v.environmentName || "—" },
    { label: "Application", value: selectedApp?.name ?? row.application.name },
    { label: "Department", value: selectedDept?.name ?? v.departmentName ?? "—" },
  ];

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
              label="Department"
              value={d.departmentId}
              editing
              kind="select"
              options={departmentOptions}
              onChange={(n) =>
                edit.patchDraft({
                  departmentId: n,
                  applicationId: "",
                  releaseId: "",
                  environmentName: "",
                  departmentName: departments.find((dept) => dept.id === n)?.name ?? "",
                })
              }
            />
            <EditableField
              label="Application"
              value={d.applicationId}
              editing
              kind="select"
              options={applicationOptions}
              onChange={(n) =>
                edit.patchDraft({
                  applicationId: n,
                  releaseId: "",
                  environmentName: "",
                })
              }
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
              label="Environment"
              value={d.environmentName}
              editing
              kind="select"
              options={environmentOptions}
              onChange={(n) => edit.setField("environmentName", n)}
            />
            <EditableField
              label="Drift Type"
              value={d.driftType}
              editing
              kind="select"
              options={driftTypeOptions}
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
      <DetailDecisionHeader
        status={{
          label: v.status,
          tone: statusTone(v.status),
          caption: resolved
            ? "Baseline restored"
            : `Open ${daysOpen} day${daysOpen === 1 ? "" : "s"} on ${v.environmentName || "this environment"}`,
        }}
        signals={signals}
        primaryAction={workflow.primary ? toAction(workflow.primary) : null}
        secondaryActions={workflow.secondary.map(toAction)}
        canEdit={canEdit}
        actionError={stepError}
        attention={attention}
        attentionClearLabel="No outstanding drift — the environment matches the intended baseline"
        timing={timing}
        scope={scope}
      />

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
      </DetailSection>

      <DetailSection
        icon={Server}
        tone="amber"
        title="What drifted"
        description="The kind of mismatch found, so the right team picks it up."
      >
        <EditableFieldGrid>
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
