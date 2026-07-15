"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  CalendarCheck,
  FileText,
  List,
  Package,
  Server,
  ShieldAlert,
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
  type ChipTone,
} from "@/components/detail/editable";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { taBtnSecondary } from "@/lib/styles";

type ConflictDetail = {
  id: string;
  conflictCode: string;
  status: string;
  priority: string;
  assignedTo: string;
  release1Code: string;
  release2Code: string;
  release1: { id: string; releaseCode: string; name: string } | null;
  release2: { id: string; releaseCode: string; name: string } | null;
  application: string;
  department: string;
  conflictingEnvironment: string;
  environmentConflictType: string;
  notes: string | null;
};

type ConflictOption = { id: string; conflictCode: string };

type ConflictDraft = {
  status: string;
  priority: string;
  assignedTo: string;
  release1Code: string;
  release2Code: string;
  application: string;
  department: string;
  conflictingEnvironment: string;
  environmentConflictType: string;
  notes: string;
};

const STATUS_OPTIONS = ["Open", "In Progress", "Resolved", "Closed"].map((v) => ({
  value: v,
  label: v,
}));

const PRIORITY_OPTIONS = [
  "P1 - Critical",
  "P2 - High",
  "P3 - Medium",
  "P4 - Low",
].map((v) => ({ value: v, label: v }));

function priorityTone(priority: string): ChipTone {
  if (priority.startsWith("P1")) return "bad";
  if (priority.startsWith("P2")) return "warn";
  return "neutral";
}

function statusTone(status: string): ChipTone {
  const s = status.toLowerCase();
  if (s.includes("open")) return "warn";
  if (s.includes("progress")) return "info";
  if (s.includes("resolv") || s.includes("closed")) return "good";
  return "neutral";
}

/** Rough resolution progress from status for the hero ring. */
function statusPercent(status: string): number {
  const s = status.toLowerCase();
  if (s.includes("closed") || s.includes("resolv")) return 100;
  if (s.includes("progress")) return 55;
  if (s.includes("open")) return 20;
  return 35;
}

function toDraft(row: ConflictDetail): ConflictDraft {
  return {
    status: row.status,
    priority: row.priority,
    assignedTo: row.assignedTo ?? "",
    release1Code: row.release1Code,
    release2Code: row.release2Code,
    application: row.application,
    department: row.department,
    conflictingEnvironment: row.conflictingEnvironment,
    environmentConflictType: row.environmentConflictType,
    notes: row.notes ?? "",
  };
}

export default function ConflictDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<ConflictDetail | null>(null);
  const [options, setOptions] = useState<ConflictOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, me] = await Promise.all([
      safeFetchJson<ConflictDetail>(`/api/conflicts/${id}`, {
        signal,
        label: "conflict-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<ConflictOption[]>("/api/conflicts", { signal, label: "conflicts-list" }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(list.ok ? list.data.map((c) => ({ id: c.id, conflictCode: c.conflictCode })) : []);
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
        .sort((a, b) => a.conflictCode.localeCompare(b.conflictCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.conflictCode })),
    [options]
  );

  const save = async () => {
    if (!row || !edit.draft) return;
    edit.setSaving(true);
    edit.setError(null);
    const res = await safeFetchJson(`/api/conflicts/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edit.draft),
      label: "conflict-patch",
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
    const res = await safeFetchJson(`/api/conflicts/${row.id}`, {
      method: "DELETE",
      label: "conflict-delete",
      rejectHttpErrors: false,
    });
    edit.setDeleting(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t delete this conflict.");
      edit.setDeleteOpen(false);
      return;
    }
    router.push("/conflicts");
  };

  if (loading) return <p className="text-slate-500 dark:text-white/60">Loading conflict…</p>;
  if (!row || !v) return <p className="text-slate-500 dark:text-white/60">Conflict not found.</p>;

  const openish = !/resolv|closed/i.test(v.status);

  return (
    <EditableDetailShell
      pageTitle="Conflict Detail"
      pageDescription="Environment window clashes between releases — left unresolved, these block shared Test/UAT/Pre-Prod bookings and force last-minute schedule changes."
      entityLabel="Conflict"
      entityCode={row.conflictCode}
      entityName={`${v.release1Code} vs ${v.release2Code}`}
      selectLabel="Select Conflict"
      selectValue={row.id}
      selectOptions={selectOptions}
      onSelectChange={(next) => next !== row.id && router.push(`/conflicts/${next}`)}
      lastRefresh={lastRefresh}
      footer="Conflict Page v2.0 · Environment Conflicts · All fields editable except Conflict ID"
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
          <ProgressLink href="/calendar" className={taBtnSecondary + " text-sm !py-2"}>
            <Calendar className="mr-1.5 inline h-4 w-4" aria-hidden />
            View Calendar
          </ProgressLink>
          <ProgressLink href="/booking" className={taBtnSecondary + " text-sm !py-2"}>
            <CalendarCheck className="mr-1.5 inline h-4 w-4" aria-hidden />
            Env Booking
          </ProgressLink>
          {row.release1 && (
            <ProgressLink href={`/releases/${row.release1.id}`} className={taBtnSecondary + " text-sm !py-2"}>
              <Package className="mr-1.5 inline h-4 w-4" aria-hidden />
              View Release 1
            </ProgressLink>
          )}
          {row.release2 && (
            <ProgressLink href={`/releases/${row.release2.id}`} className={taBtnSecondary + " text-sm !py-2"}>
              <Package className="mr-1.5 inline h-4 w-4" aria-hidden />
              View Release 2
            </ProgressLink>
          )}
          <ProgressLink href="/conflicts" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            All Conflicts
          </ProgressLink>
        </>
      }
    >
      {edit.error && (
        <TintedCallout tone="rose">{edit.error}</TintedCallout>
      )}

      <HeroStatusRow
        hero={{
          icon: ShieldAlert,
          label: "Priority",
          value: v.priority,
          tone: priorityTone(v.priority) === "bad" ? "rose" : priorityTone(v.priority) === "warn" ? "amber" : "indigo",
        }}
        secondary={{
          icon: Zap,
          label: "Status",
          value: v.status,
        }}
        metric={{
          icon: AlertTriangle,
          label: "Resolution",
          percent: statusPercent(v.status),
          caption: openish ? "still needs clearing" : "cleared / closed",
          tone: openish ? "amber" : "emerald",
        }}
      />

      <DetailSection
        icon={AlertTriangle}
        tone="rose"
        title="Conflict status"
        description="Anything actively blocking these releases from sharing the same env window."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusChip
            label={openish ? "⚠️ CONFLICT OPEN" : "✓ CLEARED"}
            tone={openish ? "bad" : "good"}
          />
          <span className="text-[12px] text-slate-500 dark:text-white/50">between</span>
          <span className="font-mono text-[12px] font-bold text-indigo-600 dark:text-indigo-300">
            {v.release1Code}
          </span>
          <span className="text-[12px] text-slate-400">&</span>
          <span className="font-mono text-[12px] font-bold text-indigo-600 dark:text-indigo-300">
            {v.release2Code}
          </span>
        </div>
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Conflict ID" value={row.conflictCode} />
          <EditableField
            label="Status"
            value={v.status}
            editing={edit.editing}
            kind="select"
            options={STATUS_OPTIONS}
            onChange={(n) => edit.setField("status", n)}
            display={<StatusChip label={v.status} tone={statusTone(v.status)} />}
          />
          <EditableField
            label="Priority"
            value={v.priority}
            editing={edit.editing}
            kind="select"
            options={PRIORITY_OPTIONS}
            onChange={(n) => edit.setField("priority", n)}
            display={<StatusChip label={v.priority} tone={priorityTone(v.priority)} />}
          />
          <EditableField
            label="Assigned To"
            value={v.assignedTo}
            editing={edit.editing}
            onChange={(n) => edit.setField("assignedTo", n)}
            placeholder="Owner name…"
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={Package}
        tone="indigo"
        title="Conflicting releases"
        description="The two releases competing for the same window or environment."
      >
        <EditableFieldGrid>
          <EditableField
            label="Release 1"
            value={v.release1Code}
            editing={edit.editing}
            mono
            onChange={(n) => edit.setField("release1Code", n)}
            display={
              row.release1 ? (
                <ProgressLink
                  href={`/releases/${row.release1.id}`}
                  className="font-mono text-[13.5px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
                >
                  {v.release1Code}
                </ProgressLink>
              ) : (
                v.release1Code
              )
            }
          />
          <EditableField
            label="Release 1 Name"
            value={row.release1?.name ?? ""}
            editing={false}
            display={row.release1?.name ?? "—"}
          />
          <EditableField
            label="Release 2"
            value={v.release2Code}
            editing={edit.editing}
            mono
            onChange={(n) => edit.setField("release2Code", n)}
            display={
              row.release2 ? (
                <ProgressLink
                  href={`/releases/${row.release2.id}`}
                  className="font-mono text-[13.5px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
                >
                  {v.release2Code}
                </ProgressLink>
              ) : (
                v.release2Code
              )
            }
          />
          <EditableField
            label="Release 2 Name"
            value={row.release2?.name ?? ""}
            editing={false}
            display={row.release2?.name ?? "—"}
          />
          <EditableField
            label="Applications"
            value={v.application}
            editing={edit.editing}
            onChange={(n) => edit.setField("application", n)}
          />
          <EditableField
            label="Departments"
            value={v.department}
            editing={edit.editing}
            onChange={(n) => edit.setField("department", n)}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={Server}
        tone="sky"
        title="Environment conflict details"
        description="Which environment overlaps, and what kind of clash it is."
      >
        <EditableFieldGrid>
          <EditableField
            label="Conflicting Env"
            value={v.conflictingEnvironment}
            editing={edit.editing}
            mono
            onChange={(n) => edit.setField("conflictingEnvironment", n)}
          />
          <EditableField
            label="Conflict Type"
            value={v.environmentConflictType}
            editing={edit.editing}
            onChange={(n) => edit.setField("environmentConflictType", n)}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={FileText}
        tone="amber"
        title="Notes & resolution"
        description="Context for CAB, owners, and how this conflict should be cleared."
      >
        {edit.editing ? (
          <EditableField
            label="Notes"
            value={v.notes}
            editing
            kind="textarea"
            onChange={(n) => edit.setField("notes", n)}
            placeholder="Resolution notes…"
          />
        ) : (
          <TintedCallout tone="rose">
            {v.notes.trim() ? v.notes : "No resolution notes recorded yet."}
          </TintedCallout>
        )}
      </DetailSection>
    </EditableDetailShell>
  );
}
