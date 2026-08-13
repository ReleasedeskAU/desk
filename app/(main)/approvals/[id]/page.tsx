"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ClipboardCheck, List, MessageSquare, Package } from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  EditableField,
  EditableFieldGrid,
  StatusChip,
  TintedCallout,
  EntityTimeline,
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
import { formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";
import {
  collectAttention,
  describeDue,
  dueTone,
  type DetailAction,
  type DetailFact,
} from "@/lib/detail-decision";
import { approvalWorkflow, type WorkflowStep } from "@/lib/entity-workflow";
import { useEntityLifecycleStatuses } from "@/hooks/useEntityLifecycleStatuses";
import type { ApprovalLifecycleConfig } from "@/lib/approval-lifecycle-config";
import { DEFAULT_APPROVAL_LIFECYCLE_CONFIG } from "@/lib/approval-lifecycle-config";
import { legalNextApprovalDecisions } from "@/lib/approval-lifecycle-transition";
import { approvalTypeSelectOptions } from "@/lib/validation/approval";

type ApprovalDetail = {
  id: string;
  approvalCode: string;
  releaseId: string;
  applicationName: string | null;
  departmentName: string | null;
  approvalType: string;
  approverId: string;
  submittedDate: string;
  decisionDate: string | null;
  decision: string;
  comments: string | null;
  conditions: string | null;
  cabMeetingId: string | null;
  release: { id: string; releaseCode: string; name: string; status: string; releaseDate: string };
  approver: { id: string; userId: string; name: string; email: string; role: string };
};

type ApprovalOption = { id: string; approvalCode: string };
type ReleaseOption = { id: string; releaseCode: string };
type UserOption = { id: string; name: string };

type ApprovalDraft = {
  releaseId: string;
  applicationName: string;
  departmentName: string;
  approvalType: string;
  approverId: string;
  submittedDate: string;
  decisionDate: string;
  decision: string;
  comments: string;
  conditions: string;
  cabMeetingId: string;
};

const APPROVAL_FIELD_LABELS: Partial<Record<keyof ApprovalDraft, string>> = {
  releaseId: "Release",
  applicationName: "Application",
  departmentName: "Department",
  approvalType: "Approval Type",
  approverId: "Approver",
  submittedDate: "Submitted Date",
  decisionDate: "Decision Date",
  decision: "Decision",
  comments: "Comments",
  conditions: "Conditions",
  cabMeetingId: "CAB Meeting",
};


function toDateInput(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function decisionTone(decision: string): ChipTone {
  const d = decision.toLowerCase();
  if (d.includes("approv")) return "good";
  if (d.includes("reject") || d.includes("denied")) return "bad";
  if (d.includes("defer")) return "info";
  if (d.includes("pending") || d.includes("review")) return "warn";
  return "neutral";
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** A gate sitting unread this long has missed at least one CAB cycle. */
const STALE_APPROVAL_DAYS = 14;

function toDraft(row: ApprovalDetail): ApprovalDraft {
  return {
    releaseId: row.releaseId,
    applicationName: row.applicationName ?? "",
    departmentName: row.departmentName ?? "",
    approvalType: row.approvalType,
    approverId: row.approverId,
    submittedDate: toDateInput(row.submittedDate),
    decisionDate: toDateInput(row.decisionDate),
    decision: row.decision,
    comments: row.comments ?? "",
    conditions: row.conditions ?? "",
    cabMeetingId: row.cabMeetingId ?? "",
  };
}

export default function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const lifecycle = useEntityLifecycleStatuses("/api/approval-lifecycle-config");
  const [row, setRow] = useState<ApprovalDetail | null>(null);
  const [options, setOptions] = useState<ApprovalOption[]>([]);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  /** Id of the workflow step currently being written, so its button can spin. */
  const [pendingStep, setPendingStep] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, releaseList, userList, me] = await Promise.all([
      safeFetchJson<ApprovalDetail>(`/api/approvals/${id}`, {
        signal,
        label: "approval-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<ApprovalOption[]>("/api/approvals", { signal, label: "approvals-list" }),
      safeFetchJson<ReleaseOption[]>("/api/releases", { signal, label: "releases-list" }),
      safeFetchJson<UserOption[]>("/api/users", { signal, label: "users-list" }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(list.ok ? list.data.map((a) => ({ id: a.id, approvalCode: a.approvalCode })) : []);
    setReleases(
      releaseList.ok ? releaseList.data.map((r) => ({ id: r.id, releaseCode: r.releaseCode })) : []
    );
    setUsers(userList.ok ? userList.data.map((u) => ({ id: u.id, name: u.name })) : []);
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
  const exceptionFromModalSave = useRef(false);
  const statusConfirm = useLifecycleStatusConfirm({
    entityLabel: "approval",
    onSuccess: async () => {
      if (exceptionFromModalSave.current) {
        exceptionFromModalSave.current = false;
        if (edit.editing) {
          edit.completeSaveSuccess(APPROVAL_FIELD_LABELS);
        }
      }
      await load();
    },
  });

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.approvalCode.localeCompare(b.approvalCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.approvalCode })),
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

  const approverOptions = useMemo(() => {
    const opts = [...users]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => ({ value: u.id, label: u.name }));
    if (row?.approver && !opts.some((o) => o.value === row.approver.id)) {
      opts.unshift({ value: row.approver.id, label: row.approver.name });
    }
    return opts;
  }, [users, row?.approver]);

  const lifecycleConfig =
    (lifecycle.config as ApprovalLifecycleConfig | null) ??
    DEFAULT_APPROVAL_LIFECYCLE_CONFIG;

  const decisionOptions = useMemo(() => {
    const current = row?.decision ?? "";
    const next = legalNextApprovalDecisions(lifecycleConfig, current);
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
  }, [lifecycleConfig, row?.decision]);

  const typeOptions = useMemo(
    () => approvalTypeSelectOptions(row?.approvalType ?? d?.approvalType),
    [row?.approvalType, d?.approvalType]
  );

  const save = async () => {
    if (!row || !edit.draft) return;
    edit.setSaving(true);
    edit.setError(null);
    const draft = edit.draft;
    const patchBody = {
      releaseId: draft.releaseId,
      applicationName: draft.applicationName || null,
      departmentName: draft.departmentName || null,
      approvalType: draft.approvalType,
      approverId: draft.approverId,
      submittedDate: draft.submittedDate,
      decisionDate: draft.decisionDate || null,
      decision: draft.decision,
      comments: draft.comments || null,
      conditions: draft.conditions || null,
      cabMeetingId: draft.cabMeetingId || null,
    };
    const res = await safeFetchJson(`/api/approvals/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
      label: "approval-patch",
      rejectHttpErrors: false,
    });
    if (!res.ok || (res.status ?? 0) >= 300) {
      const data =
        res.ok && res.data && typeof res.data === "object"
          ? (res.data as { error?: string; code?: string; unmetReasons?: unknown })
          : null;
      const apiError = typeof data?.error === "string" ? data.error : "";
      const code = typeof data?.code === "string" ? data.code : "";
      const unmetReasons = Array.isArray(data?.unmetReasons)
        ? data.unmetReasons.filter((r): r is string => typeof r === "string")
        : [];
      if (
        (code === "TRANSITION_NEEDS_OVERRIDE" || code === "CONDITIONS_REQUIRED") &&
        draft.decision !== row.decision
      ) {
        const { decision: _decision, ...extraBody } = patchBody;
        exceptionFromModalSave.current = true;
        statusConfirm.presentException({
          targetStatus: draft.decision,
          targetLabel: draft.decision,
          patchUrl: `/api/approvals/${row.id}`,
          statusField: "decision",
          extraBody,
          unmetReasons,
          leadMessage: apiError || null,
          needsConditions: code === "CONDITIONS_REQUIRED",
        });
        edit.setSaving(false);
        return;
      }
      edit.setSaving(false);
      edit.setError(apiError || "Couldn’t save changes. Try again.");
      return;
    }
    edit.setSaving(false);
    edit.completeSaveSuccess(APPROVAL_FIELD_LABELS);
    await load();
  };

  /**
   * Record a CAB decision from the header. Approving or rejecting stamps
   * today's decision date. Unusual Flexible moves open the exception panel.
   */
  const applyStep = async (step: WorkflowStep) => {
    if (!row) return;
    setPendingStep(step.id);
    setStepError(null);
    await statusConfirm.requestStatusChange({
      targetStatus: step.status,
      targetLabel: step.label,
      patchUrl: `/api/approvals/${row.id}`,
      statusField: "decision",
      extraBody: {
        ...(step.stampsResolution
          ? { decisionDate: new Date().toISOString().slice(0, 10) }
          : {}),
        ...(step.clearsResolution ? { decisionDate: null } : {}),
        ...(row.conditions ? { conditions: row.conditions } : {}),
      },
    });
    setPendingStep(null);
  };

  const remove = async () => {
    if (!row) return;
    edit.setDeleting(true);
    const res = await safeFetchJson(`/api/approvals/${row.id}`, {
      method: "DELETE",
      label: "approval-delete",
      rejectHttpErrors: false,
    });
    edit.setDeleting(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t delete this approval.");
      edit.setDeleteOpen(false);
      return;
    }
    router.push("/approvals");
  };

  if (loading) return <p className="text-slate-500 dark:text-white/60">Loading approval…</p>;
  if (!row || !v) return <p className="text-slate-500 dark:text-white/60">Approval not found.</p>;

  const pendingish = /pending|review/i.test(v.decision);
  const deferred = /defer/i.test(v.decision);
  const rejected = /reject|denied/i.test(v.decision);
  const decided = Boolean(v.decisionDate) || !pendingish;
  const undecided = pendingish || deferred;
  const selectedRelease = releases.find((r) => r.id === v.releaseId);
  const selectedApprover = users.find((u) => u.id === v.approverId) ?? row.approver;
  const releaseCode = selectedRelease?.releaseCode ?? row.release.releaseCode;
  const releaseHref = `/releases/${v.releaseId || row.release.id}`;
  const releaseDue = describeDue(row.release.releaseDate);
  const waitingDays = v.submittedDate ? daysSince(v.submittedDate) : 0;
  const workflow = approvalWorkflow(v.decision, lifecycleConfig);

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
      id: "rejected",
      when: rejected,
      tone: "critical",
      label: `CAB rejected this gate for ${releaseCode}`,
      detail: "The release cannot clear governance until the gate is resubmitted.",
      href: releaseHref,
    },
    {
      id: "gate-blocking",
      when: undecided && (releaseDue.state === "overdue" || releaseDue.state === "today" || releaseDue.state === "soon"),
      tone: "critical",
      label: `${releaseCode} goes live ${releaseDue.label.toLowerCase()} with no decision`,
      detail: "An undecided gate this close to go-live blocks the release.",
      href: releaseHref,
    },
    {
      id: "deferred",
      when: deferred,
      tone: "warning",
      label: "Deferred to a later CAB",
      detail: "No decision was taken at the last meeting.",
    },
    {
      id: "no-cab-meeting",
      when: undecided && !v.cabMeetingId.trim(),
      tone: "warning",
      label: "Not on a CAB agenda",
      detail: "No meeting is linked, so this gate has nowhere to be decided.",
    },
    {
      id: "stale",
      when: undecided && waitingDays > STALE_APPROVAL_DAYS,
      tone: "warning",
      label: `Waiting ${waitingDays} days`,
    },
    {
      id: "missing-decision-date",
      when: !undecided && !v.decisionDate,
      tone: "warning",
      label: "Decision recorded without a date",
      detail: "Governance audits need the date the decision was taken.",
    },
  ]);

  const signals: DetailFact[] = [
    { label: "Gate", value: v.approvalType || "—" },
    { label: "Approver", value: selectedApprover?.name ?? "Unassigned", tone: selectedApprover ? "neutral" : "warn" },
    {
      label: "Waiting",
      value: undecided ? `${waitingDays}d` : "—",
      tone: undecided && waitingDays > STALE_APPROVAL_DAYS ? "bad" : "neutral",
      hint: "Days since the gate was submitted for decision.",
    },
  ];

  const timing: DetailFact[] = [
    { label: "Submitted", value: v.submittedDate ? formatDate(v.submittedDate) : "—" },
    {
      label: "Decided",
      value: v.decisionDate ? formatDate(v.decisionDate) : "Not yet",
      tone: !undecided && !v.decisionDate ? "warn" : "neutral",
    },
    {
      label: "Release date",
      value: row.release.releaseDate ? formatDate(row.release.releaseDate) : "—",
      tone: undecided ? dueTone(releaseDue.state) : "neutral",
      hint: undecided ? releaseDue.label : undefined,
    },
  ];

  const scope: DetailFact[] = [
    { label: "Release", value: releaseCode, href: releaseHref, hint: row.release.name },
    { label: "Application", value: v.applicationName || "—" },
    { label: "Department", value: v.departmentName || "—" },
    {
      label: "CAB meeting",
      value: v.cabMeetingId.trim() || "Not linked",
      tone: v.cabMeetingId.trim() ? "neutral" : "warn",
    },
  ];

  return (
    <EditableDetailShell
      pageTitle="Approval Detail"
      pageDescription="CAB / sign-off gate on a release — decision and dates show whether the release can clear governance before go-live."
      entityLabel="Approval"
      entityCode={row.approvalCode}
      entityName={v.approvalType || row.approvalCode}
      selectLabel="Select Approval"
      selectValue={row.id}
      selectOptions={selectOptions}
      onSelectChange={(next) => next !== row.id && router.push(`/approvals/${next}`)}
      lastRefresh={lastRefresh}
      footer="Approvals Page v2.0 · CAB & sign-off · Approval ID is locked"
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
      lockedIdLabel="Approval ID"
      successChanges={edit.successChanges}
      onSuccessDismiss={edit.dismissSuccess}
      editForm={
        d ? (
          <EditableFieldGrid cols={2}>
            <EditableField
              label="Decision"
              value={d.decision}
              editing
              kind="select"
              options={decisionOptions}
              onChange={(n) => edit.setField("decision", n)}
              display={<StatusChip label={d.decision} tone={decisionTone(d.decision)} />}
            />
            <EditableField
              label="Approval Type"
              value={d.approvalType}
              editing
              kind="select"
              options={typeOptions}
              onChange={(n) => edit.setField("approvalType", n)}
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
              value={d.applicationName}
              editing
              onChange={(n) => edit.setField("applicationName", n)}
              placeholder="Application name…"
            />
            <EditableField
              label="Department"
              value={d.departmentName}
              editing
              onChange={(n) => edit.setField("departmentName", n)}
              placeholder="Department…"
            />
            <EditableField
              label="Approver"
              value={d.approverId}
              editing
              kind="select"
              options={approverOptions}
              onChange={(n) => edit.setField("approverId", n)}
            />
            <EditableField
              label="Submitted Date"
              value={d.submittedDate}
              editing
              kind="date"
              onChange={(n) => edit.setField("submittedDate", n)}
              display={d.submittedDate ? formatDate(d.submittedDate) : "—"}
            />
            <EditableField
              label="Decision Date"
              value={d.decisionDate}
              editing
              kind="date"
              onChange={(n) => edit.setField("decisionDate", n)}
              display={d.decisionDate ? formatDate(d.decisionDate) : "—"}
            />
            <EditableField
              label="CAB Meeting"
              value={d.cabMeetingId}
              editing
              mono
              onChange={(n) => edit.setField("cabMeetingId", n)}
              placeholder="CAB meeting id…"
            />
            <EditableField
              label="Conditions"
              value={d.conditions}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("conditions", n)}
              placeholder="Terms this approval is subject to…"
              className="sm:col-span-2"
            />
            <EditableField
              label="Comments"
              value={d.comments}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("comments", n)}
              placeholder="CAB comments…"
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
          <ProgressLink href="/calendar" className={taBtnSecondary + " text-sm !py-2"}>
            <Calendar className="mr-1.5 inline h-4 w-4" aria-hidden />
            View CAB
          </ProgressLink>
          <ProgressLink href="/approvals" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            All Approvals
          </ProgressLink>
        </>
      }
    >
      <DetailDecisionHeader
        status={{
          label: v.decision,
          tone: decisionTone(v.decision),
          caption: undecided
            ? `${v.approvalType || "Gate"} on ${releaseCode} · awaiting decision`
            : `${v.approvalType || "Gate"} on ${releaseCode}`,
        }}
        signals={signals}
        primaryAction={workflow.primary ? toAction(workflow.primary) : null}
        secondaryActions={workflow.secondary.map(toAction)}
        canEdit={canEdit}
        actionError={stepError || statusConfirm.alert?.message || null}
        attention={attention}
        attentionClearLabel="Gate cleared — governance is not holding this release"
        timing={timing}
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
            reasonLabel={
              statusConfirm.pending.needsConditions
                ? "Conditions (required)"
                : undefined
            }
            reasonPlaceholder={
              statusConfirm.pending.needsConditions
                ? "The terms this approval is subject to (this is recorded)."
                : undefined
            }
          />
        </div>
      ) : null}
      <FormAlertDialog alert={statusConfirm.alert} onDismiss={statusConfirm.dismissAlert} />

      <DetailSection
        icon={ClipboardCheck}
        tone="violet"
        title="Approval journey"
        description="Submitted → CAB review → decision — the path that clears governance before go-live."
      >
        <EntityTimeline
          phases={[
            {
              label: "Submitted",
              detail: v.submittedDate ? formatDate(v.submittedDate) : "—",
              complete: true,
              tone: "indigo",
            },
            {
              label: "CAB Review",
              detail: v.cabMeetingId.trim() || "Meeting not linked",
              active: pendingish,
              complete: !pendingish,
              tone: "violet",
            },
            {
              label: "Decision",
              detail: v.decisionDate
                ? `${v.decision} · ${formatDate(v.decisionDate)}`
                : v.decision,
              complete: decided && !pendingish,
              tone:
                decisionTone(v.decision) === "bad"
                  ? "rose"
                  : decisionTone(v.decision) === "good"
                    ? "emerald"
                    : "amber",
            },
          ]}
        />
      </DetailSection>

      <DetailSection
        icon={ClipboardCheck}
        tone="emerald"
        title="Approver details"
        description="Who owns the CAB decision for this release."
      >
        <EditableFieldGrid>
          <EditableField
            label="Approver"
            value={v.approverId}
            editing={false}
            display={selectedApprover?.name ?? "—"}
          />
          <EditableField
            label="Approver ID"
            value={row.approver.userId}
            editing={false}
            display={
              v.approverId === row.approverId ? (row.approver.userId ?? "—") : "—"
            }
          />
          <EditableField
            label="Approver Role"
            value={row.approver.role}
            editing={false}
            display={v.approverId === row.approverId ? (row.approver.role ?? "—") : "—"}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={MessageSquare}
        tone="violet"
        title="Conditions"
        description="Terms recorded when the decision requires conditions (plain text)."
      >
        <TintedCallout tone="violet">
          {v.conditions.trim() ? v.conditions : "No conditions recorded."}
        </TintedCallout>
      </DetailSection>

      <DetailSection
        icon={MessageSquare}
        tone="violet"
        title="Comments"
        description="CAB notes and sign-off rationale that reviewers leave with the decision."
      >
        <TintedCallout tone="violet">
          {v.comments.trim() ? v.comments : "No comments recorded yet."}
        </TintedCallout>
      </DetailSection>
    </EditableDetailShell>
  );
}
