"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CalendarCheck, FileText, List, Package, Server } from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  EditableField,
  EditableFieldGrid,
  EmptyHint,
  StatusChip,
  TintedCallout,
  type ChipTone,
} from "@/components/detail/editable";
import { DetailDecisionHeader } from "@/components/detail/decision";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { taBtnSecondary } from "@/lib/styles";
import {
  chipToneToFactTone,
  collectAttention,
  type DetailAction,
  type DetailFact,
} from "@/lib/detail-decision";
import { conflictWorkflow, type WorkflowStep } from "@/lib/entity-workflow";

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
  /** Env bookings tagged with this conflict code — the rows that actually clash. */
  relatedBookings?: RelatedBooking[];
};

type RelatedBooking = {
  id: string;
  bookingCode: string | null;
  application: string;
  department: string;
  conflictFlag: boolean;
  release: { id: string; releaseCode: string } | null;
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

const CONFLICT_FIELD_LABELS: Partial<Record<keyof ConflictDraft, string>> = {
  status: "Status",
  priority: "Priority",
  assignedTo: "Assigned To",
  release1Code: "Release 1",
  release2Code: "Release 2",
  application: "Applications",
  department: "Departments",
  conflictingEnvironment: "Conflicting Env",
  environmentConflictType: "Conflict Type",
  notes: "Notes",
};

const STATUS_OPTIONS = [
  "Detected",
  "Under Review",
  "Resolved",
  "Dismissed",
].map((v) => ({
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
  /** Id of the workflow step currently being written, so its button can spin. */
  const [pendingStep, setPendingStep] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

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
  const d = edit.draft;

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
    edit.completeSaveSuccess(CONFLICT_FIELD_LABELS);
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
    const res = await safeFetchJson(`/api/conflicts/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: step.status }),
      label: "conflict-status-step",
      rejectHttpErrors: false,
    });
    setPendingStep(null);
    if (!res.ok || res.status >= 300) {
      setStepError(`Couldn’t set this conflict to ${step.status}. Try again.`);
      return;
    }
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
  const workflow = conflictWorkflow(v.status);
  const bookings = row.relatedBookings ?? [];
  const flaggedBookings = bookings.filter((b) => b.conflictFlag);

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
      id: "p1-open",
      when: openish && priorityTone(v.priority) === "bad",
      tone: "critical",
      label: `${v.priority} conflict still open`,
      detail: "Two releases are competing for the same environment window at top priority.",
    },
    {
      id: "flagged-bookings",
      when: openish && flaggedBookings.length > 0,
      tone: "critical",
      label: `${flaggedBookings.length} booking${flaggedBookings.length === 1 ? "" : "s"} flagged as clashing`,
      detail: "These environment bookings overlap and one of them has to move.",
    },
    {
      id: "unassigned",
      when: openish && !v.assignedTo.trim(),
      tone: "warning",
      label: "No owner assigned",
      detail: "Nobody is coordinating the reschedule between the two releases.",
    },
    {
      id: "no-notes",
      when: openish && !v.notes.trim(),
      tone: "warning",
      label: "No resolution notes",
      detail: "Nothing is recorded about how the two teams plan to share the window.",
    },
  ]);

  const signals: DetailFact[] = [
    {
      label: "Priority",
      value: v.priority || "—",
      tone: chipToneToFactTone(priorityTone(v.priority)),
      hint: "How urgently this clash needs clearing. P1 blocks both releases.",
    },
    {
      label: "Bookings",
      value: String(bookings.length),
      tone: flaggedBookings.length > 0 ? "bad" : "neutral",
      hint: "Environment bookings tagged with this conflict code.",
    },
  ];

  const scope: DetailFact[] = [
    {
      label: "Release 1",
      value: v.release1Code,
      href: row.release1 ? `/releases/${row.release1.id}` : undefined,
      hint: row.release1?.name,
    },
    {
      label: "Release 2",
      value: v.release2Code,
      href: row.release2 ? `/releases/${row.release2.id}` : undefined,
      hint: row.release2?.name,
    },
    { label: "Environment", value: v.conflictingEnvironment || "—" },
    { label: "Clash type", value: v.environmentConflictType || "—" },
  ];

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
      editError={edit.error}
      onClearEditError={() => edit.setError(null)}
      onEdit={edit.startEdit}
      onDiscard={edit.discard}
      onSave={save}
      deleteOpen={edit.deleteOpen}
      onDeleteOpen={() => edit.setDeleteOpen(true)}
      onDeleteCancel={() => edit.setDeleteOpen(false)}
      onDeleteConfirm={remove}
      lockedIdLabel="Conflict ID"
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
              options={STATUS_OPTIONS}
              onChange={(n) => edit.setField("status", n)}
              display={<StatusChip label={d.status} tone={statusTone(d.status)} />}
            />
            <EditableField
              label="Priority"
              value={d.priority}
              editing
              kind="select"
              options={PRIORITY_OPTIONS}
              onChange={(n) => edit.setField("priority", n)}
              display={<StatusChip label={d.priority} tone={priorityTone(d.priority)} />}
            />
            <EditableField
              label="Assigned To"
              value={d.assignedTo}
              editing
              onChange={(n) => edit.setField("assignedTo", n)}
              placeholder="Owner name…"
            />
            <EditableField
              label="Release 1"
              value={d.release1Code}
              editing
              mono
              onChange={(n) => edit.setField("release1Code", n)}
            />
            <EditableField
              label="Release 2"
              value={d.release2Code}
              editing
              mono
              onChange={(n) => edit.setField("release2Code", n)}
            />
            <EditableField
              label="Applications"
              value={d.application}
              editing
              onChange={(n) => edit.setField("application", n)}
            />
            <EditableField
              label="Departments"
              value={d.department}
              editing
              onChange={(n) => edit.setField("department", n)}
            />
            <EditableField
              label="Conflicting Env"
              value={d.conflictingEnvironment}
              editing
              mono
              onChange={(n) => edit.setField("conflictingEnvironment", n)}
            />
            <EditableField
              label="Conflict Type"
              value={d.environmentConflictType}
              editing
              onChange={(n) => edit.setField("environmentConflictType", n)}
            />
            <EditableField
              label="Notes"
              value={d.notes}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("notes", n)}
              placeholder="Resolution notes…"
              className="sm:col-span-2"
            />
          </EditableFieldGrid>
        ) : null
      }
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
      <DetailDecisionHeader
        identity={[
          { label: "Assigned to", value: v.assignedTo || "Unassigned" },
          { label: "Applications", value: v.application || "—" },
          { label: "Departments", value: v.department || "—" },
        ]}
        status={{
          label: v.status,
          tone: statusTone(v.status),
          caption: openish
            ? `${v.release1Code} vs ${v.release2Code}`
            : "Window clash cleared",
        }}
        signals={signals}
        primaryAction={workflow.primary ? toAction(workflow.primary) : null}
        secondaryActions={workflow.secondary.map(toAction)}
        canEdit={canEdit}
        actionError={stepError}
        attention={attention}
        attentionClearLabel="No outstanding clash between these two releases"
        timing={[]}
        scope={scope}
      />

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
            editing={false}
            mono
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
            editing={false}
            mono
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
            editing={false}
          />
          <EditableField
            label="Departments"
            value={v.department}
            editing={false}
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
            editing={false}
            mono
          />
          <EditableField
            label="Conflict Type"
            value={v.environmentConflictType}
            editing={false}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={CalendarCheck}
        tone="violet"
        title="Clashing bookings"
        description="Environment bookings tagged with this conflict — the rows that have to move or be shared."
      >
        {bookings.length ? (
          <ul className="space-y-2">
            {bookings.map((booking) => (
              <li
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[12.5px] font-bold text-slate-700 dark:text-white/80">
                    {booking.bookingCode ?? "—"}
                  </p>
                  <p className="text-[12px] text-slate-500 dark:text-white/55">
                    {booking.application} · {booking.department}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {booking.release ? (
                    <ProgressLink
                      href={`/releases/${booking.release.id}`}
                      className="font-mono text-[12.5px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
                    >
                      {booking.release.releaseCode}
                    </ProgressLink>
                  ) : null}
                  {booking.conflictFlag ? <StatusChip label="Clashing" tone="bad" /> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyHint>No environment bookings are tagged with this conflict code.</EmptyHint>
        )}
      </DetailSection>

      <DetailSection
        icon={FileText}
        tone="amber"
        title="Notes & resolution"
        description="Context for CAB, owners, and how this conflict should be cleared."
      >
        <TintedCallout tone="rose">
          {v.notes.trim() ? v.notes : "No resolution notes recorded yet."}
        </TintedCallout>
      </DetailSection>
    </EditableDetailShell>
  );
}
