"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { List, Package, ShieldAlert, User } from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  EmptyHint,
  EditableField,
  EditableFieldGrid,
  StatusChip,
  SignoffChip,
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

type LeaveDetail = {
  id: string;
  leaveCode: string;
  leaveStart: string;
  leaveEnd: string;
  leaveType: string;
  days: number;
  riskImpact: string | null;
  riskScore: number;
  user: { id: string; userId: string; name: string; role: string; department: string };
  affectedReleases: { release: { id: string; releaseCode: string; name: string; status: string } }[];
};

type LeaveOption = { id: string; leaveCode: string };

type LeaveDraft = {
  leaveType: string;
  leaveStart: string;
  leaveEnd: string;
  days: string;
  riskImpact: string;
  riskScore: string;
};

const LEAVE_FIELD_LABELS: Partial<Record<keyof LeaveDraft, string>> = {
  leaveType: "Leave Type",
  leaveStart: "Start Date",
  leaveEnd: "End Date",
  days: "Duration (days)",
  riskImpact: "Risk Impact",
  riskScore: "Risk Score",
};

function toDateInput(iso: string) {
  return iso.slice(0, 10);
}

function scoreBand(score: number): { label: string; tone: ChipTone } {
  if (score <= 3) return { label: "Low", tone: "good" };
  if (score <= 6) return { label: "Medium", tone: "warn" };
  if (score <= 9) return { label: "High", tone: "bad" };
  return { label: "Critical", tone: "bad" };
}

function coverageFromRisk(riskImpact: string | null, riskScore: number) {
  const text = (riskImpact ?? "").toLowerCase();
  if (text.includes("covered") && !text.includes("uncovered")) {
    return { label: "Covered", tone: "good" as const };
  }
  if (text.includes("partial") || text.includes("backup")) {
    return { label: "Partial", tone: "warn" as const };
  }
  if (text.includes("uncover") || text.includes("no cover") || text.includes("unavailable")) {
    return { label: "Uncovered", tone: "bad" as const };
  }
  if (riskScore <= 3) return { label: "Covered", tone: "good" as const };
  if (riskScore <= 6) return { label: "Partial", tone: "warn" as const };
  return { label: "Uncovered", tone: "bad" as const };
}

/** Score at or above which the absence needs a named cover, not just a note. */
const HIGH_LEAVE_RISK_SCORE = 7;

/** An absence this long stops being a gap and becomes a reassignment. */
const LONG_ABSENCE_DAYS = 10;

function toDraft(row: LeaveDetail): LeaveDraft {
  return {
    leaveType: row.leaveType,
    leaveStart: toDateInput(row.leaveStart),
    leaveEnd: toDateInput(row.leaveEnd),
    days: String(row.days),
    riskImpact: row.riskImpact ?? "",
    riskScore: String(row.riskScore),
  };
}

const LEAVE_TYPE_OPTIONS = ["Annual", "Sick", "Training", "Personal", "Other"].map((v) => ({
  value: v,
  label: v,
}));

export default function LeaveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<LeaveDetail | null>(null);
  const [options, setOptions] = useState<LeaveOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, me] = await Promise.all([
      safeFetchJson<LeaveDetail>(`/api/leaves/${id}`, {
        signal,
        label: "leave-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<LeaveOption[]>("/api/leaves", { signal, label: "leaves-list" }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(list.ok ? list.data.map((l) => ({ id: l.id, leaveCode: l.leaveCode })) : []);
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
        .sort((a, b) => a.leaveCode.localeCompare(b.leaveCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.leaveCode })),
    [options]
  );

  const leaveTypes = useMemo(() => {
    const set = new Set(LEAVE_TYPE_OPTIONS.map((o) => o.value));
    if (row?.leaveType && !set.has(row.leaveType)) {
      return [{ value: row.leaveType, label: row.leaveType }, ...LEAVE_TYPE_OPTIONS];
    }
    return LEAVE_TYPE_OPTIONS;
  }, [row?.leaveType]);

  const save = async () => {
    if (!row || !edit.draft) return;
    edit.setSaving(true);
    edit.setError(null);
    const res = await safeFetchJson(`/api/leaves/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leaveType: edit.draft.leaveType,
        leaveStart: edit.draft.leaveStart,
        leaveEnd: edit.draft.leaveEnd,
        days: Number(edit.draft.days),
        riskImpact: edit.draft.riskImpact,
        riskScore: Number(edit.draft.riskScore),
      }),
      label: "leave-patch",
      rejectHttpErrors: false,
    });
    edit.setSaving(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t save changes. Try again.");
      return;
    }
    edit.completeSaveSuccess(LEAVE_FIELD_LABELS);
    await load();
  };

  const remove = async () => {
    if (!row) return;
    edit.setDeleting(true);
    const res = await safeFetchJson(`/api/leaves/${row.id}`, {
      method: "DELETE",
      label: "leave-delete",
      rejectHttpErrors: false,
    });
    edit.setDeleting(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t delete this leave record.");
      edit.setDeleteOpen(false);
      return;
    }
    router.push("/leaves");
  };

  if (loading) return <p className="text-slate-500 dark:text-white/60">Loading leave…</p>;
  if (!row || !v) return <p className="text-slate-500 dark:text-white/60">Leave record not found.</p>;

  const riskScoreNum = Number(v.riskScore) || 0;
  const coverage = coverageFromRisk(v.riskImpact || null, riskScoreNum);
  const band = scoreBand(riskScoreNum);
  const firstRelease = row.affectedReleases[0]?.release;
  const affectedCount = row.affectedReleases.length;
  const startDue = describeDue(v.leaveStart);
  const endDue = describeDue(v.leaveEnd);
  // A finished absence can no longer be planned around, so its gaps stop being
  // actionable — only live and upcoming leave raises attention.
  const finished = endDue.state === "overdue";
  const inProgress = !finished && startDue.days != null && startDue.days <= 0;
  const releaseLabel = affectedCount === 1 ? firstRelease?.releaseCode : `${affectedCount} releases`;

  const attention = collectAttention([
    {
      id: "uncovered",
      when: !finished && coverage.label === "Uncovered",
      tone: affectedCount > 0 ? "critical" : "warning",
      label: affectedCount
        ? `Uncovered absence across ${releaseLabel}`
        : "Uncovered absence",
      detail: "No backup is recorded for the work this person owns.",
      href: affectedCount === 1 && firstRelease ? `/releases/${firstRelease.id}` : undefined,
    },
    {
      id: "partial",
      when: !finished && coverage.label === "Partial" && affectedCount > 0,
      tone: "warning",
      label: `Partial cover across ${releaseLabel}`,
    },
    {
      id: "high-score",
      when: !finished && riskScoreNum >= HIGH_LEAVE_RISK_SCORE,
      tone: "warning",
      label: `Risk score ${riskScoreNum}/10`,
      detail: "Scored as a significant delivery risk while this person is away.",
    },
    {
      id: "not-assessed",
      when: !finished && !v.riskImpact.trim(),
      tone: "warning",
      label: "Coverage impact not assessed",
      detail: "Nobody has recorded what this absence means for delivery.",
    },
    {
      id: "long-absence",
      when: !finished && Number(v.days) >= LONG_ABSENCE_DAYS && affectedCount > 0,
      tone: "warning",
      label: `${v.days}-day absence during active releases`,
      detail: "Long absences usually need work reassigned rather than covered.",
    },
  ]);

  const signals: DetailFact[] = [
    { label: "Coverage", value: coverage.label, tone: chipToneToFactTone(coverage.tone) },
    {
      label: "Risk",
      value: `${riskScoreNum}/10`,
      tone: chipToneToFactTone(band.tone),
      hint: `${band.label} delivery risk while this person is away.`,
    },
    {
      label: "Releases",
      value: String(affectedCount),
      tone: affectedCount > 0 && coverage.label !== "Covered" ? "warn" : "neutral",
      hint: "Releases linked to this absence.",
    },
  ];

  const timing: DetailFact[] = [
    {
      label: "Start",
      value: v.leaveStart ? formatDate(v.leaveStart) : "—",
      tone: finished ? "neutral" : dueTone(startDue.state),
      hint: finished || !v.leaveStart ? undefined : startDue.label,
    },
    { label: "End", value: v.leaveEnd ? formatDate(v.leaveEnd) : "—" },
    { label: "Duration", value: `${v.days} day${v.days === "1" ? "" : "s"}` },
  ];

  const scope: DetailFact[] = [
    { label: "Employee ID", value: row.user.userId },
    { label: "Role", value: row.user.role },
    { label: "Department", value: row.user.department },
    {
      label: "Affected releases",
      value: affectedCount ? (releaseLabel ?? String(affectedCount)) : "None",
      href: affectedCount === 1 && firstRelease ? `/releases/${firstRelease.id}` : undefined,
    },
  ];

  // The only genuine next step on a leave record is checking the release it
  // threatens; there is no status to advance.
  const primaryAction: DetailAction | null =
    firstRelease && !finished && coverage.label !== "Covered"
      ? {
          id: "review-release",
          label: `Review ${firstRelease.releaseCode}`,
          href: `/releases/${firstRelease.id}`,
          hint: "Check whether this absence puts the release at risk.",
        }
      : null;

  return (
    <EditableDetailShell
      pageTitle="Leave Detail"
      pageDescription="Planned staff absence that may reduce coverage on active releases — without a coverage plan, delivery risk rises even when the release itself is on track."
      entityLabel="Leave"
      entityCode={row.leaveCode}
      entityName={row.user.name}
      selectLabel="Select Leave Record"
      selectValue={row.id}
      selectOptions={selectOptions}
      onSelectChange={(next) => next !== row.id && router.push(`/leaves/${next}`)}
      lastRefresh={lastRefresh}
      footer="Leave Page v2.0 · Resource availability tracking · Leave ID is locked"
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
      lockedIdLabel="Leave ID"
      successChanges={edit.successChanges}
      onSuccessDismiss={edit.dismissSuccess}
      editForm={
        d ? (
          <EditableFieldGrid cols={2}>
            <EditableField
              label="Leave Type"
              value={d.leaveType}
              editing
              kind="select"
              options={leaveTypes}
              onChange={(n) => edit.setField("leaveType", n)}
              display={<StatusChip label={d.leaveType || "—"} tone="info" />}
            />
            <EditableField
              label="Start Date"
              value={d.leaveStart}
              editing
              kind="date"
              onChange={(n) => edit.setField("leaveStart", n)}
              display={formatDate(d.leaveStart)}
            />
            <EditableField
              label="End Date"
              value={d.leaveEnd}
              editing
              kind="date"
              onChange={(n) => edit.setField("leaveEnd", n)}
              display={formatDate(d.leaveEnd)}
            />
            <EditableField
              label="Duration (days)"
              value={d.days}
              editing
              kind="number"
              onChange={(n) => edit.setField("days", n)}
              display={`${d.days} Day${d.days === "1" ? "" : "s"}`}
            />
            <EditableField
              label="Risk Impact"
              value={d.riskImpact}
              editing
              onChange={(n) => edit.setField("riskImpact", n)}
              placeholder="e.g. Covered / Partial / Uncovered"
            />
            <EditableField
              label="Risk Score"
              value={d.riskScore}
              editing
              kind="number"
              onChange={(n) => edit.setField("riskScore", n)}
            />
          </EditableFieldGrid>
        ) : null
      }
      relatedLinks={
        <>
          <ProgressLink
            href={firstRelease ? `/releases/${firstRelease.id}` : "/releases"}
            className={taBtnSecondary + " text-sm !py-2"}
          >
            <Package className="mr-1.5 inline h-4 w-4" aria-hidden />
            View Releases
          </ProgressLink>
          <ProgressLink href="/leaves" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            All Leave
          </ProgressLink>
        </>
      }
    >
      <DetailDecisionHeader
        status={{
          label: coverage.label,
          tone: coverage.tone,
          caption: finished
            ? `${v.leaveType || "Leave"} · completed`
            : `${v.leaveType || "Leave"} · ${inProgress ? "in progress" : startDue.label.toLowerCase()}`,
        }}
        signals={signals}
        primaryAction={primaryAction}
        canEdit={canEdit}
        attention={attention}
        attentionClearLabel="Absence is covered and no release is exposed"
        timing={timing}
        scope={scope}
      />

      <DetailSection
        icon={ShieldAlert}
        tone="rose"
        title="Release impact"
        description="Releases that may be affected while this person is away."
      >
        <div className="mb-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
            Affected Releases
          </p>
          {row.affectedReleases.length === 0 ? (
            <EmptyHint>No affected releases linked — this leave doesn’t currently touch a go-live.</EmptyHint>
          ) : (
            <span className="inline-flex flex-wrap gap-x-1">
              {row.affectedReleases.map(({ release }, i) => (
                <span key={release.id}>
                  {i > 0 && <span className="mr-1 text-slate-400">,</span>}
                  <ProgressLink
                    href={`/releases/${release.id}`}
                    className="font-mono text-[12px] font-bold text-indigo-600 hover:underline dark:text-indigo-300"
                  >
                    {release.releaseCode}
                  </ProgressLink>
                </span>
              ))}
            </span>
          )}
        </div>
        <EditableFieldGrid>
          <EditableField
            label="Risk Impact"
            value={v.riskImpact}
            editing={false}
            display={v.riskImpact.trim() || "Not assessed"}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={User}
        tone="amber"
        title="Coverage plan"
        description="Who covers the role while they’re away — not stored on this record yet."
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <SignoffChip label="Cover assignee" done={false} />
          <SignoffChip label="Handover complete" done={false} />
        </div>
        <div className="mt-3">
          <EmptyHint>
            No coverage assignee recorded for this leave. When coverage tracking is added, Cover ID, Cover Name, and
            handover notes will appear here.
          </EmptyHint>
        </div>
      </DetailSection>
    </EditableDetailShell>
  );
}
