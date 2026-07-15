"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  Calendar,
  CheckCircle2,
  FileText,
  List,
  Package,
  User,
  Wrench,
  Zap,
} from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  EmptyHint,
  LockedIdField,
  EditableField,
  EditableFieldGrid,
  StatusChip,
  HeroStatusRow,
  TintedCallout,
  SignoffChip,
  ScoreBar,
  type ChipTone,
} from "@/components/detail/editable";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";

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

type BlockerDraft = {
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

function heroToneFromSeverity(severity: string): "rose" | "amber" | "emerald" | "indigo" {
  const t = severityTone(severity);
  if (t === "bad") return "rose";
  if (t === "warn") return "amber";
  if (t === "good") return "emerald";
  return "indigo";
}

function resolutionPercent(status: string, daysOpen: number): number {
  const s = status.toLowerCase();
  if (s.includes("resolv") || s.includes("closed")) return 100;
  if (s.includes("progress")) return 60;
  // Open longer → lower "clearance" feeling
  return Math.max(8, 40 - Math.min(daysOpen, 30));
}

function toDraft(row: BlockerDetail): BlockerDraft {
  return {
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
const STATUS_OPTIONS = ["Open", "In Progress", "Resolved", "Closed"].map((v) => ({
  value: v,
  label: v,
}));

export default function BlockerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<BlockerDetail | null>(null);
  const [options, setOptions] = useState<BlockerOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, me] = await Promise.all([
      safeFetchJson<BlockerDetail>(`/api/blockers/${id}`, {
        signal,
        label: "blocker-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<BlockerOption[]>("/api/blockers", { signal, label: "blockers-list" }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(list.ok ? list.data.map((b) => ({ id: b.id, blockerCode: b.blockerCode })) : []);
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
        .sort((a, b) => a.blockerCode.localeCompare(b.blockerCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.blockerCode })),
    [options]
  );

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
    const res = await safeFetchJson(`/api/blockers/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...d,
        daysOpen: Number(d.daysOpen),
        assignedTo: d.assignedTo || null,
        rootCause: d.rootCause || null,
        resolutionNotes: d.resolutionNotes || null,
        targetResolutionDate: d.targetResolutionDate || null,
        actualResolutionDate: d.actualResolutionDate || null,
      }),
      label: "blocker-patch",
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
      lastRefresh={lastRefresh}
      footer="Blocker Page v2.0 · Release blocker tracking · Blocker ID is locked"
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
      {edit.error && <TintedCallout tone="rose">{edit.error}</TintedCallout>}

      <HeroStatusRow
        hero={{
          icon: AlertOctagon,
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
          icon: CheckCircle2,
          label: "Clearance",
          percent: resolutionPercent(v.status, daysOpenNum),
          caption: resolved ? "blocker cleared" : `${daysOpenNum} day${daysOpenNum === 1 ? "" : "s"} open`,
          tone: resolved ? "emerald" : daysOpenNum > 14 ? "rose" : "amber",
        }}
      />

      <DetailSection
        icon={AlertOctagon}
        tone="rose"
        title="Blocker status"
        description="How severe this is, whether it’s still open, and how long it’s been blocking."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusChip
            label={resolved ? "CLEARED" : "⚠️ BLOCKING"}
            tone={resolved ? "good" : "bad"}
          />
          <StatusChip label={v.severity} tone={severityTone(v.severity)} />
          <StatusChip label={v.status} tone={statusTone(v.status)} />
        </div>
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Blocker ID" value={row.blockerCode} />
          <EditableField
            label="Status"
            value={v.status}
            editing={edit.editing}
            kind="select"
            options={statusOptions}
            onChange={(n) => edit.setField("status", n)}
          />
          <EditableField
            label="Severity"
            value={v.severity}
            editing={edit.editing}
            kind="select"
            options={severityOptions}
            onChange={(n) => edit.setField("severity", n)}
          />
          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
              Days Open
            </p>
            {edit.editing ? (
              <EditableField
                label=""
                value={v.daysOpen}
                editing
                kind="number"
                onChange={(n) => edit.setField("daysOpen", n)}
              />
            ) : (
              <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5">
                <ScoreBar value={Math.min(daysOpenNum, 30)} max={30} label={`${daysOpenNum} days`} />
              </div>
            )}
          </div>
        </EditableFieldGrid>
      </DetailSection>

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
            editing={edit.editing}
            onChange={(n) => edit.setField("blockerType", n)}
          />
          <EditableField
            label="Department"
            value={v.department}
            editing={edit.editing}
            onChange={(n) => edit.setField("department", n)}
          />
          <EditableField
            label="Application"
            value={v.application}
            editing={edit.editing}
            onChange={(n) => edit.setField("application", n)}
          />
        </EditableFieldGrid>
        <div className="mt-4">
          {edit.editing ? (
            <EditableField
              label="Description"
              value={v.blockerDescription}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("blockerDescription", n)}
            />
          ) : (
            <>
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                Description
              </p>
              <TintedCallout tone="amber">
                {v.blockerDescription.trim() || "No description recorded."}
              </TintedCallout>
            </>
          )}
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
            editing={edit.editing}
            mono
            onChange={(n) => edit.setField("releaseCode", n)}
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
            editing={edit.editing}
            onChange={(n) => edit.setField("releaseName", n)}
          />
          <EditableField
            label="Impact on Release"
            value={v.impactOnRelease}
            editing={edit.editing}
            onChange={(n) => edit.setField("impactOnRelease", n)}
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
            editing={edit.editing}
            onChange={(n) => edit.setField("raisedBy", n)}
          />
          <EditableField
            label="Assigned To"
            value={v.assignedTo}
            editing={edit.editing}
            onChange={(n) => edit.setField("assignedTo", n)}
            placeholder="Assignee…"
          />
          <EditableField
            label="Escalation Level"
            value={v.escalationLevel}
            editing={edit.editing}
            onChange={(n) => edit.setField("escalationLevel", n)}
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
            editing={edit.editing}
            kind="date"
            onChange={(n) => edit.setField("raisedDate", n)}
            display={v.raisedDate ? formatDate(v.raisedDate) : "—"}
          />
          <EditableField
            label="Target Resolution"
            value={v.targetResolutionDate}
            editing={edit.editing}
            kind="date"
            onChange={(n) => edit.setField("targetResolutionDate", n)}
            display={v.targetResolutionDate ? formatDate(v.targetResolutionDate) : "—"}
          />
          <EditableField
            label="Actual Resolution"
            value={v.actualResolutionDate}
            editing={edit.editing}
            kind="date"
            onChange={(n) => edit.setField("actualResolutionDate", n)}
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
        {edit.editing ? (
          <>
            <EditableField
              label="Root Cause"
              value={v.rootCause}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("rootCause", n)}
              placeholder="What’s causing the block…"
            />
            <div className="mt-4">
              <EditableField
                label="Resolution Notes"
                value={v.resolutionNotes}
                editing
                kind="textarea"
                onChange={(n) => edit.setField("resolutionNotes", n)}
                placeholder="Plan or outcome…"
              />
            </div>
          </>
        ) : (
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
        )}
      </DetailSection>
    </EditableDetailShell>
  );
}
