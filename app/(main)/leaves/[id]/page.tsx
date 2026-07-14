"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, List, Package, ShieldAlert, User, Zap } from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  EmptyHint,
  LockedIdField,
  EditableField,
  EditableFieldGrid,
  StatusChip,
  ScoreBar,
  HeroStatusRow,
  TintedCallout,
  SignoffChip,
  type ChipTone,
} from "@/components/detail/editable";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";

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
    return { label: "Covered", tone: "good" as const, hero: "emerald" as const };
  }
  if (text.includes("partial") || text.includes("backup")) {
    return { label: "Partial", tone: "warn" as const, hero: "amber" as const };
  }
  if (text.includes("uncover") || text.includes("no cover") || text.includes("unavailable")) {
    return { label: "Uncovered", tone: "bad" as const, hero: "rose" as const };
  }
  if (riskScore <= 3) return { label: "Covered", tone: "good" as const, hero: "emerald" as const };
  if (riskScore <= 6) return { label: "Partial", tone: "warn" as const, hero: "amber" as const };
  return { label: "Uncovered", tone: "bad" as const, hero: "rose" as const };
}

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
    edit.discard();
    edit.setSaveMessage("Saved");
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
  // Invert score for ring: low risk = high "safety"
  const safetyPct = Math.max(0, Math.min(100, ((10 - riskScoreNum) / 10) * 100));

  return (
    <EditableDetailShell
      pageTitle="Leave Detail"
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
      {edit.error && <TintedCallout tone="rose">{edit.error}</TintedCallout>}

      <HeroStatusRow
        hero={{
          icon: ShieldAlert,
          label: "Coverage Status",
          value: coverage.label,
          tone: coverage.hero,
        }}
        secondary={{
          icon: Zap,
          label: "Leave Type",
          value: v.leaveType || "—",
        }}
        metric={{
          icon: ShieldAlert,
          label: "Risk Safety",
          percent: safetyPct,
          caption: `${band.label} risk (score ${riskScoreNum}/10)`,
          tone: coverage.hero === "emerald" ? "emerald" : coverage.hero === "amber" ? "amber" : "rose",
        }}
      />

      <DetailSection
        icon={CalendarOff}
        tone="violet"
        title="Leave identity"
        description="What kind of absence this is, and the permanent leave ID."
      >
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Leave ID" value={row.leaveCode} />
          <EditableField
            label="Leave Type"
            value={v.leaveType}
            editing={edit.editing}
            kind="select"
            options={leaveTypes}
            onChange={(n) => edit.setField("leaveType", n)}
            display={<StatusChip label={v.leaveType || "—"} tone="info" />}
          />
          <EditableField
            label="Coverage"
            value={coverage.label}
            editing={false}
            display={<StatusChip label={coverage.label} tone={coverage.tone} />}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={User}
        tone="indigo"
        title="Employee information"
        description="Who is away — identity comes from the linked user record (read-only here)."
      >
        <EditableFieldGrid>
          <EditableField label="Employee ID" value={row.user.userId} editing={false} mono />
          <EditableField label="Employee Name" value={row.user.name} editing={false} />
          <EditableField label="Role" value={row.user.role} editing={false} />
          <EditableField label="Department" value={row.user.department} editing={false} />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={CalendarOff}
        tone="violet"
        title="Leave period"
        description="When the person is out and how many working days are covered."
      >
        <EditableFieldGrid cols={3}>
          <EditableField
            label="Start Date"
            value={v.leaveStart}
            editing={edit.editing}
            kind="date"
            onChange={(n) => edit.setField("leaveStart", n)}
            display={formatDate(v.leaveStart)}
          />
          <EditableField
            label="End Date"
            value={v.leaveEnd}
            editing={edit.editing}
            kind="date"
            onChange={(n) => edit.setField("leaveEnd", n)}
            display={formatDate(v.leaveEnd)}
          />
          <EditableField
            label="Duration (days)"
            value={v.days}
            editing={edit.editing}
            kind="number"
            onChange={(n) => edit.setField("days", n)}
            display={`${v.days} Day${v.days === "1" ? "" : "s"}`}
          />
        </EditableFieldGrid>
      </DetailSection>

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
            editing={edit.editing}
            onChange={(n) => edit.setField("riskImpact", n)}
            placeholder="e.g. Covered / Partial / Uncovered"
          />
          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
              Risk Score
            </p>
            {edit.editing ? (
              <EditableField
                label=""
                value={v.riskScore}
                editing
                kind="number"
                onChange={(n) => edit.setField("riskScore", n)}
              />
            ) : (
              <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5">
                <ScoreBar
                  value={riskScoreNum}
                  max={10}
                  label={`${band.label} risk`}
                />
              </div>
            )}
          </div>
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
