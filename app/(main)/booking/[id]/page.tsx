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

type BookingDetail = {
  id: string;
  bookingCode: string | null;
  applicationId: string;
  application: { id: string; name: string };
  releaseId: string | null;
  release: { id: string; releaseCode: string; name?: string } | null;
  departmentName: string | null;
  purpose: string | null;
  dependencies: string | null;
  releaseSize: string | null;
  prodReleaseDate: string | null;
  cabDate: string | null;
  testEnvCode: string | null;
  testStart: string | null;
  testEnd: string | null;
  testDays: number | null;
  uatEnvCode: string | null;
  uatStart: string | null;
  uatEnd: string | null;
  uatDays: number | null;
  preProdEnvCode: string | null;
  preProdStart: string | null;
  preProdEnd: string | null;
  preProdDays: number | null;
  conflictFlag: boolean;
  environmentConflictId: string | null;
  conflicts: { id: string; conflictCode: string; status: string; priority: string }[];
};

type BookingOption = { id: string; bookingCode: string | null };
type ReleaseOption = { id: string; releaseCode: string; name: string };

type BookingDraft = {
  releaseId: string;
  releaseSize: string;
  dependencies: string;
  purpose: string;
  prodReleaseDate: string;
  cabDate: string;
  testEnvCode: string;
  testStart: string;
  testEnd: string;
  uatEnvCode: string;
  uatStart: string;
  uatEnd: string;
  preProdEnvCode: string;
  preProdStart: string;
  preProdEnd: string;
  conflictFlag: string;
  environmentConflictId: string;
};

const CONFLICT_FLAG_OPTIONS = [
  { value: "false", label: "No" },
  { value: "true", label: "Yes" },
];

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function d(value: string | null | undefined) {
  return value ? formatDate(value) : "—";
}

function emptyToNull(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

function windowFilled(start: string, end: string): boolean {
  return Boolean(start.trim() && end.trim());
}

/** Share of Test / UAT / Pre-Prod windows that have both start and end. */
function readinessPercent(draft: BookingDraft): number {
  const filled = [
    windowFilled(draft.testStart, draft.testEnd),
    windowFilled(draft.uatStart, draft.uatEnd),
    windowFilled(draft.preProdStart, draft.preProdEnd),
  ].filter(Boolean).length;
  return Math.round((filled / 3) * 100);
}

function conflictTone(flag: boolean): ChipTone {
  return flag ? "bad" : "good";
}

function toDraft(row: BookingDetail): BookingDraft {
  return {
    releaseId: row.release?.id ?? row.releaseId ?? "",
    releaseSize: row.releaseSize ?? "",
    dependencies: row.dependencies ?? "",
    purpose: row.purpose ?? "",
    prodReleaseDate: toDateInput(row.prodReleaseDate),
    cabDate: toDateInput(row.cabDate),
    testEnvCode: row.testEnvCode ?? "",
    testStart: toDateInput(row.testStart),
    testEnd: toDateInput(row.testEnd),
    uatEnvCode: row.uatEnvCode ?? "",
    uatStart: toDateInput(row.uatStart),
    uatEnd: toDateInput(row.uatEnd),
    preProdEnvCode: row.preProdEnvCode ?? "",
    preProdStart: toDateInput(row.preProdStart),
    preProdEnd: toDateInput(row.preProdEnd),
    conflictFlag: row.conflictFlag ? "true" : "false",
    environmentConflictId: row.environmentConflictId ?? "",
  };
}

function ConflictLinks({
  raw,
  conflicts,
}: {
  raw: string | null;
  conflicts: BookingDetail["conflicts"];
}) {
  const codes = (raw ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!codes.length) return <>—</>;
  return (
    <span className="inline-flex flex-wrap gap-x-1">
      {codes.map((code, i) => {
        const hit = conflicts.find((c) => c.conflictCode === code);
        return (
          <span key={code}>
            {i > 0 && <span className="mr-1 text-slate-400">,</span>}
            <ProgressLink
              href={`/conflicts/${hit?.id ?? encodeURIComponent(code)}`}
              className="font-mono text-xs text-indigo-600 hover:underline dark:text-indigo-300"
            >
              {code}
            </ProgressLink>
          </span>
        );
      })}
    </span>
  );
}

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<BookingDetail | null>(null);
  const [options, setOptions] = useState<BookingOption[]>([]);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, releaseList, me] = await Promise.all([
      safeFetchJson<BookingDetail>(`/api/bookings/${id}`, {
        signal,
        label: "booking-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<BookingOption[]>("/api/bookings", { signal, label: "bookings-list" }),
      safeFetchJson<ReleaseOption[]>("/api/releases", { signal, label: "booking-releases" }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(list.ok ? list.data.map((b) => ({ id: b.id, bookingCode: b.bookingCode })) : []);
    setReleases(
      releaseList.ok
        ? releaseList.data
            .map((r) => ({ id: r.id, releaseCode: r.releaseCode, name: r.name }))
            .sort((a, b) => a.releaseCode.localeCompare(b.releaseCode))
        : []
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

  const source = useMemo(() => (row ? toDraft(row) : null), [row]);
  const edit = useEditableDetail(source);
  const canEdit = sessionCanEdit(user);
  const v = edit.values;

  const selectOptions = useMemo(
    () =>
      [...options]
        .filter((o) => o.bookingCode)
        .sort((a, b) =>
          String(a.bookingCode).localeCompare(String(b.bookingCode), undefined, { numeric: true })
        )
        .map((o) => ({ value: o.id, label: o.bookingCode! })),
    [options]
  );

  const releaseSelectOptions = useMemo(
    () => [
      { value: "", label: "No release linked" },
      ...releases.map((r) => ({
        value: r.id,
        label: `${r.releaseCode} — ${r.name}`,
      })),
    ],
    [releases]
  );

  const save = async () => {
    if (!row || !edit.draft) return;
    edit.setSaving(true);
    edit.setError(null);
    const draft = edit.draft;
    const res = await safeFetchJson(`/api/bookings/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseId: draft.releaseId || null,
        releaseSize: emptyToNull(draft.releaseSize),
        dependencies: emptyToNull(draft.dependencies),
        purpose: emptyToNull(draft.purpose),
        prodReleaseDate: draft.prodReleaseDate || null,
        cabDate: draft.cabDate || null,
        testEnvCode: emptyToNull(draft.testEnvCode),
        testStart: draft.testStart || null,
        testEnd: draft.testEnd || null,
        uatEnvCode: emptyToNull(draft.uatEnvCode),
        uatStart: draft.uatStart || null,
        uatEnd: draft.uatEnd || null,
        preProdEnvCode: emptyToNull(draft.preProdEnvCode),
        preProdStart: draft.preProdStart || null,
        preProdEnd: draft.preProdEnd || null,
        conflictFlag: draft.conflictFlag === "true",
        environmentConflictId: emptyToNull(draft.environmentConflictId),
      }),
      label: "booking-patch",
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
    const res = await safeFetchJson(`/api/bookings/${row.id}`, {
      method: "DELETE",
      label: "booking-delete",
      rejectHttpErrors: false,
    });
    edit.setDeleting(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t delete this booking.");
      edit.setDeleteOpen(false);
      return;
    }
    router.push("/booking");
  };

  if (loading) return <p className="text-slate-500 dark:text-white/60">Loading booking…</p>;
  if (!row || !v) return <p className="text-slate-500 dark:text-white/60">Booking not found.</p>;

  const code = row.bookingCode ?? row.id;
  const hasConflict = v.conflictFlag === "true";
  const readyPct = readinessPercent(v);
  const selectedRelease = releases.find((r) => r.id === v.releaseId) ?? row.release;

  return (
    <EditableDetailShell
      pageTitle="Environment Booking Detail"
      pageDescription="Test/UAT/Pre-Prod windows for a release — overlapping bookings surface as conflict flags and force env owners to reshuffle before CAB."
      entityLabel="Booking"
      entityCode={code}
      entityName={row.application.name}
      selectLabel="Select Booking"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: code }]}
      onSelectChange={(next) => next !== row.id && router.push(`/booking/${next}`)}
      lastRefresh={lastRefresh}
      footer="Env Booking Page v2.0 · Environment windows · Booking ID is locked"
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
          {selectedRelease && (
            <ProgressLink
              href={`/releases/${selectedRelease.id}`}
              className={taBtnSecondary + " text-sm !py-2"}
            >
              <Package className="mr-1.5 inline h-4 w-4" aria-hidden />
              View Release
            </ProgressLink>
          )}
          {row.conflicts[0] ? (
            <ProgressLink
              href={`/conflicts/${row.conflicts[0].id}`}
              className={taBtnSecondary + " text-sm !py-2"}
            >
              <AlertTriangle className="mr-1.5 inline h-4 w-4" aria-hidden />
              View Conflict
            </ProgressLink>
          ) : row.environmentConflictId ? (
            <ProgressLink
              href={`/conflicts/${encodeURIComponent(row.environmentConflictId.split(",")[0].trim())}`}
              className={taBtnSecondary + " text-sm !py-2"}
            >
              <AlertTriangle className="mr-1.5 inline h-4 w-4" aria-hidden />
              View Conflict
            </ProgressLink>
          ) : (
            <ProgressLink href="/conflicts" className={taBtnSecondary + " text-sm !py-2"}>
              <AlertTriangle className="mr-1.5 inline h-4 w-4" aria-hidden />
              All Conflicts
            </ProgressLink>
          )}
          <ProgressLink href="/booking" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            All Bookings
          </ProgressLink>
        </>
      }
    >
      {edit.error && <TintedCallout tone="rose">{edit.error}</TintedCallout>}

      <HeroStatusRow
        hero={{
          icon: ShieldAlert,
          label: "Conflict Flag",
          value: hasConflict ? "Yes — conflict" : "No conflict",
          tone: hasConflict ? "rose" : "emerald",
        }}
        secondary={{
          icon: Zap,
          label: "Application",
          value: row.application.name,
        }}
        metric={{
          icon: CalendarCheck,
          label: "Window readiness",
          percent: readyPct,
          caption:
            readyPct === 100
              ? "Test, UAT & Pre-Prod set"
              : readyPct === 0
                ? "no phase windows yet"
                : "some windows still open",
          tone: readyPct === 100 ? "emerald" : readyPct > 0 ? "amber" : "rose",
        }}
      />

      <DetailSection
        icon={CalendarCheck}
        tone="sky"
        title="Environment journey"
        description="Test → UAT → Pre-Prod → CAB path derived from the booked windows."
      >
        <EntityTimeline
          phases={[
            {
              label: "Test",
              detail: `${d(v.testStart)} → ${d(v.testEnd)} · ${row.testDays ?? "—"} days`,
              tone: "sky",
              complete: windowFilled(v.testStart, v.testEnd),
            },
            {
              label: "UAT",
              detail: `${d(v.uatStart)} → ${d(v.uatEnd)} · ${row.uatDays ?? "—"} days`,
              tone: "violet",
              complete: windowFilled(v.uatStart, v.uatEnd),
            },
            {
              label: "Pre-Prod",
              detail: `${d(v.preProdStart)} → ${d(v.preProdEnd)} · ${row.preProdDays ?? "—"} days`,
              tone: "amber",
              complete: windowFilled(v.preProdStart, v.preProdEnd),
            },
            {
              label: "CAB / Prod",
              detail: `CAB ${d(v.cabDate)} · Prod ${d(v.prodReleaseDate)}`,
              tone: hasConflict ? "rose" : "emerald",
              complete: Boolean(v.cabDate && v.prodReleaseDate),
            },
          ]}
        />
      </DetailSection>

      <DetailSection
        icon={Package}
        tone="indigo"
        title="Release & booking identity"
        description="Which release owns this booking, and how large / dependent it is."
      >
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Booking ID" value={code} />
          <EditableField
            label="Release"
            value={v.releaseId}
            editing={edit.editing}
            kind="select"
            options={releaseSelectOptions}
            onChange={(n) => edit.setField("releaseId", n)}
            display={
              selectedRelease ? (
                <ProgressLink
                  href={`/releases/${selectedRelease.id}`}
                  className="font-mono text-[13.5px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
                >
                  {selectedRelease.releaseCode}
                </ProgressLink>
              ) : (
                "—"
              )
            }
          />
          <EditableField
            label="Application"
            value={row.application.name}
            editing={false}
            display={row.application.name}
          />
          <EditableField
            label="Department"
            value={row.departmentName ?? ""}
            editing={false}
            display={row.departmentName ?? "—"}
          />
          <EditableField
            label="Release Size"
            value={v.releaseSize}
            editing={edit.editing}
            onChange={(n) => edit.setField("releaseSize", n)}
            placeholder="S / M / L…"
          />
          <EditableField
            label="Dependencies"
            value={v.dependencies}
            editing={edit.editing}
            onChange={(n) => edit.setField("dependencies", n)}
            placeholder="NA or dep codes…"
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={Calendar}
        tone="violet"
        title="Key dates"
        description="CAB and production targets that the env windows must land before."
      >
        <EditableFieldGrid>
          <EditableField
            label="Prod Release Date"
            value={v.prodReleaseDate}
            editing={edit.editing}
            kind="date"
            onChange={(n) => edit.setField("prodReleaseDate", n)}
            display={d(v.prodReleaseDate)}
          />
          <EditableField
            label="CAB Date"
            value={v.cabDate}
            editing={edit.editing}
            kind="date"
            onChange={(n) => edit.setField("cabDate", n)}
            display={d(v.cabDate)}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={Server}
        tone="sky"
        title="Test environment"
        description="First shared window — overlaps here usually raise the conflict flag."
      >
        <EditableFieldGrid cols={3}>
          <EditableField
            label="Test Env"
            value={v.testEnvCode}
            editing={edit.editing}
            mono
            onChange={(n) => edit.setField("testEnvCode", n)}
          />
          <EditableField
            label="Test Start"
            value={v.testStart}
            editing={edit.editing}
            kind="date"
            onChange={(n) => edit.setField("testStart", n)}
            display={d(v.testStart)}
          />
          <EditableField
            label="Test End"
            value={v.testEnd}
            editing={edit.editing}
            kind="date"
            onChange={(n) => edit.setField("testEnd", n)}
            display={d(v.testEnd)}
          />
          <EditableField
            label="Test Days"
            value={row.testDays != null ? String(row.testDays) : ""}
            editing={false}
            display={row.testDays ?? "—"}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={Server}
        tone="violet"
        title="UAT environment"
        description="Business acceptance window after Test clears."
      >
        <EditableFieldGrid cols={3}>
          <EditableField
            label="UAT Env"
            value={v.uatEnvCode}
            editing={edit.editing}
            mono
            onChange={(n) => edit.setField("uatEnvCode", n)}
          />
          <EditableField
            label="UAT Start"
            value={v.uatStart}
            editing={edit.editing}
            kind="date"
            onChange={(n) => edit.setField("uatStart", n)}
            display={d(v.uatStart)}
          />
          <EditableField
            label="UAT End"
            value={v.uatEnd}
            editing={edit.editing}
            kind="date"
            onChange={(n) => edit.setField("uatEnd", n)}
            display={d(v.uatEnd)}
          />
          <EditableField
            label="UAT Days"
            value={row.uatDays != null ? String(row.uatDays) : ""}
            editing={false}
            display={row.uatDays ?? "—"}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={Server}
        tone="amber"
        title="Pre-Prod environment"
        description="Final dress rehearsal before CAB / production."
      >
        <EditableFieldGrid cols={3}>
          <EditableField
            label="Pre-Prod Env"
            value={v.preProdEnvCode}
            editing={edit.editing}
            mono
            onChange={(n) => edit.setField("preProdEnvCode", n)}
          />
          <EditableField
            label="Pre-Prod Start"
            value={v.preProdStart}
            editing={edit.editing}
            kind="date"
            onChange={(n) => edit.setField("preProdStart", n)}
            display={d(v.preProdStart)}
          />
          <EditableField
            label="Pre-Prod End"
            value={v.preProdEnd}
            editing={edit.editing}
            kind="date"
            onChange={(n) => edit.setField("preProdEnd", n)}
            display={d(v.preProdEnd)}
          />
          <EditableField
            label="Pre-Prod Days"
            value={row.preProdDays != null ? String(row.preProdDays) : ""}
            editing={false}
            display={row.preProdDays ?? "—"}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={AlertTriangle}
        tone="rose"
        title="Conflict & purpose"
        description="Overlap flags and the booking note CAB / env owners use when reshuffling."
      >
        <EditableFieldGrid>
          <EditableField
            label="Conflict Flag"
            value={v.conflictFlag}
            editing={edit.editing}
            kind="select"
            options={CONFLICT_FLAG_OPTIONS}
            onChange={(n) => edit.setField("conflictFlag", n)}
            display={
              <StatusChip
                label={hasConflict ? "⚠️ CONFLICT" : "Clear"}
                tone={conflictTone(hasConflict)}
              />
            }
          />
          <EditableField
            label="Environment Conflict ID"
            value={v.environmentConflictId}
            editing={edit.editing}
            mono
            onChange={(n) => edit.setField("environmentConflictId", n)}
            placeholder="CNF-001, CNF-002…"
            display={
              <ConflictLinks raw={v.environmentConflictId || null} conflicts={row.conflicts} />
            }
          />
        </EditableFieldGrid>
        <div className="mt-4">
          {edit.editing ? (
            <EditableField
              label="Purpose / Notes"
              value={v.purpose}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("purpose", n)}
              placeholder="Why this booking exists…"
            />
          ) : (
            <TintedCallout tone="amber">
              <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-amber-700/80 dark:text-amber-300/80">
                Purpose / Notes
              </span>
              {v.purpose.trim() ? v.purpose : "No purpose notes recorded yet."}
            </TintedCallout>
          )}
        </div>
      </DetailSection>

      <DetailSection
        icon={FileText}
        tone="indigo"
        title="Linked conflicts"
        description="Conflicts already tied to this booking from the environment conflict register."
      >
        {row.conflicts.length === 0 ? (
          <p className="text-[13px] text-slate-500 dark:text-white/55">No linked conflicts.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {row.conflicts.map((c) => (
              <li key={c.id}>
                <ProgressLink
                  href={`/conflicts/${c.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 font-mono text-[12px] font-semibold text-rose-700 hover:underline dark:bg-rose-500/15 dark:text-rose-300"
                >
                  {c.conflictCode}
                  <span className="font-sans font-medium text-rose-500/80 dark:text-rose-300/70">
                    · {c.status}
                  </span>
                </ProgressLink>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
    </EditableDetailShell>
  );
}
