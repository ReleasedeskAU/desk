"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, FileText, List, Package, User, Wrench } from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  EmptyHint,
  EditableField,
  EditableFieldGrid,
  TintedCallout,
  SignoffChip,
  type ChipTone,
} from "@/components/detail/editable";
import { DetailDecisionHeader } from "@/components/detail/decision";
import { LifecycleExceptionConfirm } from "@/components/detail/LifecycleExceptionConfirm";
import { LifecycleExceptionModal } from "@/components/detail/LifecycleExceptionModal";
import { LifecycleTerminalStatusNotice } from "@/components/detail/LifecycleTerminalStatusNotice";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { useLifecycleStatusConfirm } from "@/hooks/useLifecycleStatusConfirm";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";
import { buildFormSaveAlert } from "@/lib/form-save-alert";
import { parseUxNoticesFromHeaders } from "@/lib/ux-notice";
import { blockerCategoryOptions } from "@/lib/blocker-categories";
import {
  createDefaultBlockerLifecycleConfig,
  type BlockerLifecycleConfig,
} from "@/lib/blocker-lifecycle-config";
import { legalNextBlockerStatuses } from "@/lib/blocker-lifecycle-transition";
import { findEntityStatusByLabel } from "@/lib/entity-lifecycle-status-ui";
import { shouldShowTerminalLifecycleEditNotice } from "@/lib/lifecycle-terminal-edit-notice";
import {
  chipToneToFactTone,
  collectAttention,
  describeDue,
  dueTone,
  type DetailAction,
  type DetailFact,
} from "@/lib/detail-decision";
import { blockerWorkflow, type WorkflowStep } from "@/lib/entity-workflow";

type BlockerDetail = {
  id: string;
  blockerCode: string;
  releaseCode: string;
  releaseName: string;
  department: string;
  application: string;
  blockerType: string;
  blockerDescription: string;
  severity: string;
  raisedDate: string;
  raisedBy: string;
  assignedTo: string | null;
  status: string;
  targetResolutionDate: string | null;
  actualResolutionDate: string | null;
  daysOpen: number;
  escalationLevel: string;
  rootCause: string | null;
  resolutionNotes: string | null;
  impactOnRelease: string;
  release: { id: string; releaseCode: string; name: string; status: string } | null;
};

type BlockerOption = { id: string; blockerCode: string };
type ReleaseLookup = {
  id: string;
  releaseCode: string;
  name: string;
  departmentName: string;
  applicationName: string;
};

type BlockerDraft = {
  releaseId: string;
  releaseCode: string;
  releaseName: string;
  department: string;
  application: string;
  blockerType: string;
  blockerDescription: string;
  severity: string;
  raisedDate: string;
  raisedBy: string;
  assignedTo: string;
  status: string;
  targetResolutionDate: string;
  actualResolutionDate: string;
  daysOpen: string;
  escalationLevel: string;
  rootCause: string;
  resolutionNotes: string;
  impactOnRelease: string;
};

const BLOCKER_FIELD_LABELS: Partial<Record<keyof BlockerDraft, string>> = {
  releaseId: "Release ID",
  releaseCode: "Release ID",
  releaseName: "Release Name",
  department: "Department",
  application: "Application",
  blockerType: "Category",
  blockerDescription: "Description",
  severity: "Severity",
  raisedDate: "Raised Date",
  raisedBy: "Raised By",
  assignedTo: "Assigned To",
  status: "Status",
  targetResolutionDate: "Target Resolution",
  actualResolutionDate: "Actual Resolution",
  daysOpen: "Days Open",
  escalationLevel: "Escalation Level",
  rootCause: "Root Cause",
  resolutionNotes: "Resolution Notes",
  impactOnRelease: "Impact on Release",
};

const BLOCKER_TYPE_OPTIONS = blockerCategoryOptions();

const ESCALATION_OPTIONS = ["L1 - Team Lead", "L2 - Manager", "L3 - Director"].map((v) => ({
  value: v,
  label: v,
}));

function toDateInput(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
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
  if (s.includes("open") || s.includes("block")) return "bad";
  if (s.includes("progress")) return "warn";
  if (s.includes("resolv") || s.includes("closed")) return "good";
  return "neutral";
}

/** A blocker open past this many days is ageing and needs escalation attention. */
const AGEING_BLOCKER_DAYS = 14;

function toDraft(row: BlockerDetail, releases: ReleaseLookup[]): BlockerDraft {
  const matched =
    releases.find((r) => r.id === row.release?.id) ??
    releases.find((r) => r.releaseCode === row.releaseCode);
  return {
    releaseId: matched?.id ?? row.release?.id ?? "",
    releaseCode: row.releaseCode,
    releaseName: row.releaseName,
    department: row.department,
    application: row.application,
    blockerType: row.blockerType,
    blockerDescription: row.blockerDescription,
    severity: row.severity,
    raisedDate: toDateInput(row.raisedDate),
    raisedBy: row.raisedBy,
    assignedTo: row.assignedTo ?? "",
    status: row.status,
    targetResolutionDate: toDateInput(row.targetResolutionDate),
    actualResolutionDate: toDateInput(row.actualResolutionDate),
    daysOpen: String(row.daysOpen),
    escalationLevel: row.escalationLevel,
    rootCause: row.rootCause ?? "",
    resolutionNotes: row.resolutionNotes ?? "",
    impactOnRelease: row.impactOnRelease,
  };
}

const SEVERITY_OPTIONS = ["Critical", "High", "Medium", "Low"].map((v) => ({ value: v, label: v }));

export default function BlockerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<BlockerDetail | null>(null);
  const [options, setOptions] = useState<BlockerOption[]>([]);
  const [releases, setReleases] = useState<ReleaseLookup[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  const [lifecycleConfig, setLifecycleConfig] = useState<BlockerLifecycleConfig>(
    createDefaultBlockerLifecycleConfig
  );
  const [pendingStep, setPendingStep] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, releaseList, me, lifecycle] = await Promise.all([
      safeFetchJson<BlockerDetail>(`/api/blockers/${id}`, {
        signal,
        label: "blocker-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<BlockerOption[]>("/api/blockers", { signal, label: "blockers-list" }),
      safeFetchJson<
        {
          id: string;
          releaseCode: string;
          name: string;
          department?: { name?: string } | null;
          applications?: { application?: { name?: string } | null }[];
        }[]
      >("/api/releases", { signal, label: "releases-list" }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
      safeFetchJson<{ config: BlockerLifecycleConfig }>("/api/blocker-lifecycle-config", {
        signal,
        label: "blocker-lifecycle",
        rejectHttpErrors: false,
      }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(list.ok ? list.data.map((b) => ({ id: b.id, blockerCode: b.blockerCode })) : []);
    setReleases(
      releaseList.ok
        ? releaseList.data.map((r) => ({
            id: r.id,
            releaseCode: r.releaseCode,
            name: r.name,
            departmentName: r.department?.name ?? "",
            applicationName: r.applications?.[0]?.application?.name ?? "",
          }))
        : [],
    );
    if (me.ok) setUser(me.data.user);
    if (lifecycle.ok && lifecycle.data?.config) {
      setLifecycleConfig(lifecycle.data.config);
    }
    setLastRefresh(new Date());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const source = useMemo(() => (row ? toDraft(row, releases) : null), [row, releases]);
  const edit = useEditableDetail(source);
  const canEdit = sessionCanEdit(user);
  const v = edit.values;
  const d = edit.draft;
  const exceptionFromModalSave = useRef(false);
  const statusConfirm = useLifecycleStatusConfirm({
    entityLabel: "blocker",
    onSuccess: async () => {
      if (exceptionFromModalSave.current) {
        exceptionFromModalSave.current = false;
        edit.completeSaveSuccess(BLOCKER_FIELD_LABELS);
      }
      await load();
    },
  });

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.blockerCode.localeCompare(b.blockerCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.blockerCode })),
    [options]
  );

  const releaseOptions = useMemo(() => {
    const opts = [...releases]
      .sort((a, b) => a.releaseCode.localeCompare(b.releaseCode, undefined, { numeric: true }))
      .map((r) => ({ value: r.id, label: `${r.releaseCode} — ${r.name}` }));
    const releaseId = d?.releaseId || row?.release?.id;
    if (releaseId && !opts.some((o) => o.value === releaseId)) {
      opts.unshift({
        value: releaseId,
        label: row?.releaseCode ? `${row.releaseCode} — ${row.releaseName}` : releaseId,
      });
    }
    return opts;
  }, [releases, d?.releaseId, row?.release?.id, row?.releaseCode, row?.releaseName]);

  const severityOptions = useMemo(() => {
    const set = new Set(SEVERITY_OPTIONS.map((o) => o.value));
    if (row?.severity && !set.has(row.severity)) {
      return [{ value: row.severity, label: row.severity }, ...SEVERITY_OPTIONS];
    }
    return SEVERITY_OPTIONS;
  }, [row?.severity]);

  const statusOptions = useMemo(() => {
    const current = row?.status ?? "";
    const next = legalNextBlockerStatuses(lifecycleConfig, current);
    const labels = [current, ...next.map((s) => s.label)].filter(Boolean);
    const seen = new Set<string>();
    return labels
      .filter((label) => {
        const key = label.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((label) => ({ value: label, label }));
  }, [lifecycleConfig, row?.status]);

  const showTerminalStatusNotice = useMemo(() => {
    const current = row?.status ?? "";
    const next = legalNextBlockerStatuses(lifecycleConfig, current);
    return shouldShowTerminalLifecycleEditNotice({
      currentLabel: current,
      legalNextCount: next.length,
      isTerminal: findEntityStatusByLabel(lifecycleConfig, current)?.terminal,
    });
  }, [lifecycleConfig, row?.status]);

  const blockerTypeOptions = useMemo(() => {
    const set = new Set(BLOCKER_TYPE_OPTIONS.map((o) => o.value));
    if (row?.blockerType && !set.has(row.blockerType)) {
      return [{ value: row.blockerType, label: row.blockerType }, ...BLOCKER_TYPE_OPTIONS];
    }
    return BLOCKER_TYPE_OPTIONS;
  }, [row?.blockerType]);

  const escalationOptions = useMemo(() => {
    const set = new Set(ESCALATION_OPTIONS.map((o) => o.value));
    if (row?.escalationLevel && !set.has(row.escalationLevel)) {
      return [{ value: row.escalationLevel, label: row.escalationLevel }, ...ESCALATION_OPTIONS];
    }
    return ESCALATION_OPTIONS;
  }, [row?.escalationLevel]);

  const save = async () => {
    if (!row || !edit.draft) return;
    edit.setSaving(true);
    edit.setError(null);
    const draft = edit.draft;
    if (!draft.releaseCode) {
      edit.setSaving(false);
      edit.setError("Release is required.");
      return;
    }
    const res = await safeFetchJson(`/api/blockers/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseCode: draft.releaseCode,
        releaseName: draft.releaseName,
        department: draft.department,
        application: draft.application,
        blockerType: draft.blockerType,
        blockerDescription: draft.blockerDescription,
        severity: draft.severity,
        raisedDate: draft.raisedDate,
        raisedBy: draft.raisedBy,
        assignedTo: draft.assignedTo || null,
        status: draft.status,
        targetResolutionDate: draft.targetResolutionDate || null,
        actualResolutionDate: draft.actualResolutionDate || null,
        daysOpen: Number(draft.daysOpen),
        escalationLevel: draft.escalationLevel,
        rootCause: draft.rootCause || null,
        resolutionNotes: draft.resolutionNotes || null,
        impactOnRelease: draft.impactOnRelease,
      }),
      label: "blocker-patch",
      rejectHttpErrors: false,
    });
    edit.setSaving(false);
    if (!res.ok || res.status >= 300) {
      const data =
        res.ok && res.data && typeof res.data === "object"
          ? (res.data as {
              error?: string;
              code?: string;
              unmetReasons?: unknown;
              transition?: { unmetReasons?: unknown };
            })
          : null;
      const apiError = typeof data?.error === "string" ? data.error : "";
      const code = typeof data?.code === "string" ? data.code : "";
      const unmetReasons = Array.isArray(data?.unmetReasons)
        ? data.unmetReasons.filter((r): r is string => typeof r === "string")
        : Array.isArray(data?.transition?.unmetReasons)
          ? data.transition.unmetReasons.filter((r): r is string => typeof r === "string")
          : [];
      if (code === "TRANSITION_NEEDS_OVERRIDE" && draft.status !== row.status) {
        const extraBody = {
          releaseCode: draft.releaseCode,
          releaseName: draft.releaseName,
          department: draft.department,
          application: draft.application,
          blockerType: draft.blockerType,
          blockerDescription: draft.blockerDescription,
          severity: draft.severity,
          raisedDate: draft.raisedDate,
          raisedBy: draft.raisedBy,
          assignedTo: draft.assignedTo || null,
          targetResolutionDate: draft.targetResolutionDate || null,
          actualResolutionDate: draft.actualResolutionDate || null,
          daysOpen: Number(draft.daysOpen),
          escalationLevel: draft.escalationLevel,
          rootCause: draft.rootCause || null,
          resolutionNotes: draft.resolutionNotes || null,
          impactOnRelease: draft.impactOnRelease,
        };
        exceptionFromModalSave.current = true;
        // Close Edit modal first — exception UI is behind it at z-50 otherwise
        // and the 422 looks like a silent save failure.
        edit.discard();
        statusConfirm.presentException({
          targetStatus: draft.status,
          targetLabel: draft.status,
          patchUrl: `/api/blockers/${row.id}`,
          extraBody,
          unmetReasons,
          leadMessage: apiError || null,
        });
        return;
      }
      edit.setSaving(false);
      edit.setError(apiError || "Couldn’t save changes. Try again.");
      statusConfirm.setAlert(
        buildFormSaveAlert(data, apiError || "Couldn’t save changes. Try again.", {
          entityLabel: "blocker",
        })
      );
      return;
    }
    const notices = parseUxNoticesFromHeaders(res.headers);
    if (notices[0]) {
      statusConfirm.setAlert({
        title: notices[0].title,
        message: notices[0].message,
        details: notices[0].details,
        variant: "notice",
      });
    }
    edit.completeSaveSuccess(BLOCKER_FIELD_LABELS);
    await load();
  };

  /**
   * Apply a one-click status transition from the decision header.
   * Resolving stamps today's date; reopening clears it, so a reopened blocker
   * never keeps a stale resolution date. The API re-validates and enforces the
   * editor role — this button is convenience, not the permission check.
   */
  const applyStep = async (step: WorkflowStep) => {
    if (!row) return;
    setPendingStep(step.id);
    setStepError(null);
    const extraBody: Record<string, unknown> = {};
    if (step.stampsResolution) extraBody.actualResolutionDate = new Date().toISOString().slice(0, 10);
    if (step.clearsResolution) extraBody.actualResolutionDate = null;
    await statusConfirm.requestStatusChange({
      targetStatus: step.status,
      targetLabel: step.label,
      patchUrl: `/api/blockers/${row.id}`,
      extraBody,
    });
    setPendingStep(null);
  };

  const remove = async () => {
    if (!row) return;
    edit.setDeleting(true);
    const res = await safeFetchJson(`/api/blockers/${row.id}`, {
      method: "DELETE",
      label: "blocker-delete",
      rejectHttpErrors: false,
    });
    edit.setDeleting(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t delete this blocker.");
      edit.setDeleteOpen(false);
      return;
    }
    router.push("/blockers");
  };

  if (loading) return <p className="text-slate-500 dark:text-white/60">Loading blocker…</p>;
  if (!row || !v) return <p className="text-slate-500 dark:text-white/60">Blocker not found.</p>;

  const daysOpenNum = Number(v.daysOpen) || 0;
  const resolved = /resolv|closed/i.test(v.status);
  const targetDue = describeDue(v.targetResolutionDate);
  const workflow = blockerWorkflow(v.status, lifecycleConfig);

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
      id: "overdue",
      when: !resolved && targetDue.state === "overdue",
      tone: "critical",
      label: `Target resolution ${targetDue.label.toLowerCase()}`,
      detail: "The date this blocker was promised to clear has already passed.",
    },
    {
      id: "severity",
      when: !resolved && severityTone(v.severity) === "bad",
      tone: "critical",
      label: `${v.severity} severity still open`,
      detail: "High-severity blockers hold the release until resolved or formally accepted.",
    },
    {
      id: "unassigned",
      when: !resolved && !v.assignedTo.trim(),
      tone: "warning",
      label: "No assignee",
      detail: "Nobody owns this blocker, so no one is working to clear it.",
    },
    {
      id: "ageing",
      when: !resolved && daysOpenNum > AGEING_BLOCKER_DAYS,
      tone: "warning",
      label: `Open ${daysOpenNum} days`,
      detail: "Long-running blockers usually need escalation rather than more waiting.",
    },
    {
      id: "no-root-cause",
      when: !resolved && !v.rootCause.trim(),
      tone: "warning",
      label: "Root cause not recorded",
    },
  ]);

  const signals: DetailFact[] = [
    {
      label: "Severity",
      value: v.severity || "—",
      tone: chipToneToFactTone(severityTone(v.severity)),
      hint: "How hard this blocker hits the release. Critical and High hold go-live until cleared.",
    },
    {
      label: "Days open",
      value: String(daysOpenNum),
      tone: resolved ? "good" : daysOpenNum > AGEING_BLOCKER_DAYS ? "bad" : "warn",
      hint: "Calendar days since the blocker was raised.",
    },
  ];

  const timing: DetailFact[] = [
    { label: "Raised", value: v.raisedDate ? formatDate(v.raisedDate) : "—" },
    {
      label: "Target resolution",
      value: v.targetResolutionDate ? formatDate(v.targetResolutionDate) : "—",
      tone: resolved ? "neutral" : dueTone(targetDue.state),
      hint: !resolved && v.targetResolutionDate ? targetDue.label : undefined,
    },
    {
      label: "Actual resolution",
      value: v.actualResolutionDate ? formatDate(v.actualResolutionDate) : "—",
      tone: v.actualResolutionDate ? "good" : "neutral",
    },
  ];

  const scope: DetailFact[] = [
    {
      label: "Release",
      value: v.releaseCode || "—",
      href: row.release ? `/releases/${row.release.id}` : undefined,
      hint: v.releaseName,
    },
    { label: "Application", value: v.application || "—" },
    { label: "Department", value: v.department || "—" },
    { label: "Impact", value: v.impactOnRelease || "—" },
  ];

  return (
    <EditableDetailShell
      pageTitle="Blocker Detail"
      pageDescription="An open issue preventing a release from progressing — days open and severity show how urgently this must clear before the deployment window."
      entityLabel="Blocker"
      entityCode={row.blockerCode}
      entityName={v.blockerType || row.blockerCode}
      selectLabel="Select Blocker"
      selectValue={row.id}
      selectOptions={selectOptions}
      onSelectChange={(next) => next !== row.id && router.push(`/blockers/${next}`)}
      headerStatus={{
        label: v.status,
        tone: statusTone(v.status),
        caption: resolved ? "Cleared" : "Blocking the release",
      }}
      lastRefresh={lastRefresh}
      footer="Blocker Page v2.0 · Release blocker tracking · Blocker ID is locked"
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
      lockedIdLabel="Blocker ID"
      successChanges={edit.successChanges}
      onSuccessDismiss={edit.dismissSuccess}
      editForm={
        d ? (
          <EditableFieldGrid cols={2}>
            <EditableField
              label="Status"
              value={d.status}
              editing
              kind="select"
              options={statusOptions}
              onChange={(n) => edit.setField("status", n)}
              hint={
                showTerminalStatusNotice ? (
                  <LifecycleTerminalStatusNotice statusLabel={d.status} />
                ) : undefined
              }
            />
            <EditableField
              label="Severity"
              value={d.severity}
              editing
              kind="select"
              options={severityOptions}
              onChange={(n) => edit.setField("severity", n)}
            />
            <EditableField
              label="Days Open"
              value={d.daysOpen}
              editing
              kind="number"
              onChange={(n) => edit.setField("daysOpen", n)}
            />
            <EditableField
              label="Category"
              value={d.blockerType}
              editing
              kind="select"
              options={blockerTypeOptions}
              onChange={(n) => edit.setField("blockerType", n)}
            />
            <EditableField
              label="Release"
              value={d.releaseId}
              editing
              kind="select"
              options={releaseOptions}
              onChange={(n) => {
                const release = releases.find((r) => r.id === n);
                edit.patchDraft({
                  releaseId: n,
                  releaseCode: release?.releaseCode ?? "",
                  releaseName: release?.name ?? "",
                  department: release?.departmentName ?? d.department,
                  application: release?.applicationName || d.application,
                });
              }}
            />
            <EditableField
              label="Department"
              value={d.department}
              editing={false}
              display={d.department || "—"}
            />
            <EditableField
              label="Application"
              value={d.application}
              editing
              onChange={(n) => edit.setField("application", n)}
              placeholder="Application…"
            />
            <EditableField
              label="Description"
              value={d.blockerDescription}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("blockerDescription", n)}
              className="sm:col-span-2"
            />
            <EditableField
              label="Impact on Release"
              value={d.impactOnRelease}
              editing
              onChange={(n) => edit.setField("impactOnRelease", n)}
            />
            <EditableField
              label="Raised By"
              value={d.raisedBy}
              editing
              onChange={(n) => edit.setField("raisedBy", n)}
            />
            <EditableField
              label="Assigned To"
              value={d.assignedTo}
              editing
              onChange={(n) => edit.setField("assignedTo", n)}
              placeholder="Assignee…"
            />
            <EditableField
              label="Escalation Level"
              value={d.escalationLevel}
              editing
              kind="select"
              options={escalationOptions}
              onChange={(n) => edit.setField("escalationLevel", n)}
            />
            <EditableField
              label="Raised Date"
              value={d.raisedDate}
              editing
              kind="date"
              onChange={(n) => edit.setField("raisedDate", n)}
              display={d.raisedDate ? formatDate(d.raisedDate) : "—"}
            />
            <EditableField
              label="Target Resolution"
              value={d.targetResolutionDate}
              editing
              kind="date"
              onChange={(n) => edit.setField("targetResolutionDate", n)}
              display={d.targetResolutionDate ? formatDate(d.targetResolutionDate) : "—"}
            />
            <EditableField
              label="Actual Resolution"
              value={d.actualResolutionDate}
              editing
              kind="date"
              onChange={(n) => edit.setField("actualResolutionDate", n)}
              display={d.actualResolutionDate ? formatDate(d.actualResolutionDate) : "—"}
            />
            <EditableField
              label="Root Cause"
              value={d.rootCause}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("rootCause", n)}
              placeholder="What’s causing the block…"
              className="sm:col-span-2"
            />
            <EditableField
              label="Resolution Notes"
              value={d.resolutionNotes}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("resolutionNotes", n)}
              placeholder="Plan or outcome…"
              className="sm:col-span-2"
            />
          </EditableFieldGrid>
        ) : null
      }
      relatedLinks={
        <>
          {row.release && (
            <ProgressLink href={`/releases/${row.release.id}`} className={taBtnSecondary + " text-sm !py-2"}>
              <Package className="mr-1.5 inline h-4 w-4" aria-hidden />
              View Release
            </ProgressLink>
          )}
          <ProgressLink href="/blockers" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            All Blockers
          </ProgressLink>
        </>
      }
    >
      <DetailDecisionHeader
        identity={[
          { label: "Assigned to", value: v.assignedTo || "Unassigned" },
          { label: "Raised by", value: v.raisedBy || "—" },
          { label: "Category", value: v.blockerType || "—" },
        ]}
        status={{
          label: v.status,
          tone: statusTone(v.status),
          caption: resolved ? "Cleared" : "Blocking the release",
        }}
        signals={signals}
        primaryAction={workflow.primary ? toAction(workflow.primary) : null}
        secondaryActions={workflow.secondary.map(toAction)}
        canEdit={canEdit}
        actionError={stepError}
        attention={attention}
        attentionClearLabel="Nothing outstanding on this blocker"
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
            reasonLabel="Exception reason (required)"
            reasonPlaceholder="e.g. Waiting on vendor CAB slot — RM approved pending hold"
          />
        ) : null}
      </LifecycleExceptionModal>
      <FormAlertDialog alert={statusConfirm.alert} onDismiss={statusConfirm.dismissAlert} />

      <DetailSection
        icon={FileText}
        tone="indigo"
        title="Blocker information"
        description="What category of blocker this is and the description owners see first."
      >
        <EditableFieldGrid>
          <EditableField
            label="Category"
            value={v.blockerType}
            editing={false}
          />
          <EditableField
            label="Department"
            value={v.department}
            editing={false}
          />
          <EditableField
            label="Application"
            value={v.application}
            editing={false}
          />
        </EditableFieldGrid>
        <div className="mt-4">
          <>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
              Description
            </p>
            <TintedCallout tone="amber">
              {v.blockerDescription.trim() || "No description recorded."}
            </TintedCallout>
          </>
        </div>
      </DetailSection>

      <DetailSection
        icon={Package}
        tone="sky"
        title="Affected release"
        description="Which release is blocked and how hard the impact hits go-live."
      >
        <EditableFieldGrid>
          <EditableField
            label="Release ID"
            value={v.releaseCode}
            editing={false}
            mono
            display={
              row.release ? (
                <ProgressLink
                  href={`/releases/${row.release.id}`}
                  className="font-mono text-[13.5px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
                >
                  {v.releaseCode}
                </ProgressLink>
              ) : (
                v.releaseCode
              )
            }
          />
          <EditableField
            label="Release Name"
            value={v.releaseName}
            editing={false}
          />
          <EditableField
            label="Impact on Release"
            value={v.impactOnRelease}
            editing={false}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={User}
        tone="violet"
        title="Ownership & escalation"
        description="Who raised it, who owns it now, and how far it’s been escalated."
      >
        <EditableFieldGrid>
          <EditableField
            label="Raised By"
            value={v.raisedBy}
            editing={false}
          />
          <EditableField
            label="Assigned To"
            value={v.assignedTo}
            editing={false}
          />
          <EditableField
            label="Escalation Level"
            value={v.escalationLevel}
            editing={false}
          />
        </EditableFieldGrid>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <SignoffChip label="Assignee set" done={Boolean(v.assignedTo.trim())} />
          <SignoffChip label="Escalation target" done={false} />
        </div>
        <div className="mt-3">
          <EmptyHint>No escalation target recorded for this blocker yet.</EmptyHint>
        </div>
      </DetailSection>

      <DetailSection
        icon={Calendar}
        tone="violet"
        title="Timeline"
        description="When it was raised and the target / actual resolution dates."
      >
        <EditableFieldGrid>
          <EditableField
            label="Raised Date"
            value={v.raisedDate}
            editing={false}
            display={v.raisedDate ? formatDate(v.raisedDate) : "—"}
          />
          <EditableField
            label="Target Resolution"
            value={v.targetResolutionDate}
            editing={false}
            display={v.targetResolutionDate ? formatDate(v.targetResolutionDate) : "—"}
          />
          <EditableField
            label="Actual Resolution"
            value={v.actualResolutionDate}
            editing={false}
            display={v.actualResolutionDate ? formatDate(v.actualResolutionDate) : "—"}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={Wrench}
        tone="emerald"
        title="Resolution progress"
        description="Root cause and the plan to clear this blocker."
      >
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
              Root Cause
            </p>
            <TintedCallout tone="amber">
              {v.rootCause.trim() || "Root cause not recorded yet."}
            </TintedCallout>
          </div>
          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
              Resolution Notes
            </p>
            <TintedCallout tone="emerald">
              {v.resolutionNotes.trim() || "No resolution plan recorded yet."}
            </TintedCallout>
          </div>
        </div>
      </DetailSection>
    </EditableDetailShell>
  );
}
