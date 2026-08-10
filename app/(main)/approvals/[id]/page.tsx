"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
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
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
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
  cabMeetingId: "CAB Meeting",
};

const DECISION_OPTIONS = [
  "Pending",
  "Approved",
  "Rejected",
  "Deferred",
  "Expired",
  "Withdrawn",
].map((v) => ({
  value: v,
  label: v,
}));

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
    cabMeetingId: row.cabMeetingId ?? "",
  };
}

export default function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
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

  const decisionOptions = useMemo(() => {
    const set = new Set(DECISION_OPTIONS.map((o) => o.value));
    if (row?.decision && !set.has(row.decision)) {
      return [{ value: row.decision, label: row.decision }, ...DECISION_OPTIONS];
    }
    return DECISION_OPTIONS;
  }, [row?.decision]);

  const save = async () => {
    if (!row || !edit.draft) return;
    edit.setSaving(true);
    edit.setError(null);
    const d = edit.draft;
    // approvalCode is immutable — never include it in PATCH.
    const res = await safeFetchJson(`/api/approvals/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseId: d.releaseId,
        applicationName: d.applicationName || null,
        departmentName: d.departmentName || null,
        approvalType: d.approvalType,
        approverId: d.approverId,
        submittedDate: d.submittedDate,
        decisionDate: d.decisionDate || null,
        decision: d.decision,
        comments: d.comments || null,
        cabMeetingId: d.cabMeetingId || null,
      }),
      label: "approval-patch",
      rejectHttpErrors: false,
    });
    edit.setSaving(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t save changes. Try again.");
      return;
    }
    edit.completeSaveSuccess(APPROVAL_FIELD_LABELS);
    await load();
  };

  /**
   * Record a CAB decision from the header. Approving or rejecting stamps
   * today's decision date and reopening clears it, so the date always matches
   * the decision. The API re-validates and enforces the editor role.
   */
  const applyStep = async (step: WorkflowStep) => {
    if (!row) return;
    setPendingStep(step.id);
    setStepError(null);
    const res = await safeFetchJson(`/api/approvals/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: step.status,
        ...(step.stampsResolution
          ? { decisionDate: new Date().toISOString().slice(0, 10) }
          : {}),
        ...(step.clearsResolution ? { decisionDate: null } : {}),
      }),
      label: "approval-decision-step",
      rejectHttpErrors: false,
    });
    setPendingStep(null);
    if (!res.ok || res.status >= 300) {
      setStepError(`Couldn’t record a ${step.status} decision. Try again.`);
      return;
    }
    await load();
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
  const workflow = approvalWorkflow(v.decision);

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
              onChange={(n) => edit.setField("approvalType", n)}
              placeholder="e.g. CAB Sign-off…"
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
        actionError={stepError}
        attention={attention}
        attentionClearLabel="Gate cleared — governance is not holding this release"
        timing={timing}
        scope={scope}
      />

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
