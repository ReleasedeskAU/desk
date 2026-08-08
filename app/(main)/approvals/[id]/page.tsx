"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  List,
  MessageSquare,
  Package,
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
  type ChipTone,
} from "@/components/detail/editable";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";

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

function heroToneFromDecision(decision: string): "emerald" | "rose" | "amber" | "sky" {
  const t = decisionTone(decision);
  if (t === "good") return "emerald";
  if (t === "bad") return "rose";
  if (t === "warn") return "amber";
  return "sky";
}

/** Rough CAB clearance progress from decision state for the hero ring. */
function decisionPercent(decision: string): number {
  const d = decision.toLowerCase();
  if (d.includes("approv") || d.includes("reject") || d.includes("denied")) return 100;
  if (d.includes("defer")) return 70;
  if (d.includes("review")) return 55;
  if (d.includes("pending")) return 30;
  return 40;
}

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
  const decided = Boolean(v.decisionDate) || !pendingish;
  const selectedRelease = releases.find((r) => r.id === v.releaseId);
  const selectedApprover = users.find((u) => u.id === v.approverId) ?? row.approver;
  const pct = decisionPercent(v.decision);

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
      <HeroStatusRow
        hero={{
          icon: CheckCircle2,
          label: "Decision",
          value: v.decision,
          tone: heroToneFromDecision(v.decision),
        }}
        secondary={{
          icon: ClipboardCheck,
          label: "Approval Type",
          value: v.approvalType || "—",
        }}
        metric={{
          icon: Zap,
          label: "Progress",
          percent: pct,
          caption: pendingish ? "awaiting CAB decision" : "decision recorded",
          tone: heroToneFromDecision(v.decision),
        }}
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
        icon={CheckCircle2}
        tone="indigo"
        title="Decision status"
        description="Current CAB outcome and the approval type that gates this release."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusChip
            label={pendingish ? "⚠️ AWAITING DECISION" : "✓ DECISION RECORDED"}
            tone={pendingish ? "warn" : decisionTone(v.decision)}
          />
          <StatusChip label={v.decision} tone={decisionTone(v.decision)} />
        </div>
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Approval ID" value={row.approvalCode} />
          <EditableField
            label="Decision"
            value={v.decision}
            editing={false}
            display={<StatusChip label={v.decision} tone={decisionTone(v.decision)} />}
          />
          <EditableField
            label="Approval Type"
            value={v.approvalType}
            editing={false}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={Package}
        tone="sky"
        title="Release information"
        description="Which release this sign-off covers and the org context around it."
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
            value={v.applicationName}
            editing={false}
          />
          <EditableField
            label="Department"
            value={v.departmentName}
            editing={false}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={User}
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
        icon={Calendar}
        tone="amber"
        title="Timeline & CAB"
        description="Submission and decision dates, plus the linked CAB meeting when available."
      >
        <EditableFieldGrid>
          <EditableField
            label="Submitted Date"
            value={v.submittedDate}
            editing={false}
            display={v.submittedDate ? formatDate(v.submittedDate) : "—"}
          />
          <EditableField
            label="Decision Date"
            value={v.decisionDate}
            editing={false}
            display={v.decisionDate ? formatDate(v.decisionDate) : "—"}
          />
          <EditableField
            label="CAB Meeting"
            value={v.cabMeetingId}
            editing={false}
            mono
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
