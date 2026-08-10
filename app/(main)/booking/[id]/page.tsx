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
} from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  EditableField,
  EditableFieldGrid,
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
  type DetailFact,
} from "@/lib/detail-decision";

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

const BOOKING_FIELD_LABELS: Partial<Record<keyof BookingDraft, string>> = {
  releaseId: "Release",
  releaseSize: "Release Size",
  dependencies: "Dependencies",
  purpose: "Purpose / Notes",
  prodReleaseDate: "Prod Release Date",
  cabDate: "CAB Date",
  testEnvCode: "Test Env",
  testStart: "Test Start",
  testEnd: "Test End",
  uatEnvCode: "UAT Env",
  uatStart: "UAT Start",
  uatEnd: "UAT End",
  preProdEnvCode: "Pre-Prod Env",
  preProdStart: "Pre-Prod Start",
  preProdEnd: "Pre-Prod End",
  conflictFlag: "Conflict Flag",
  environmentConflictId: "Environment Conflict ID",
};

const CONFLICT_FLAG_OPTIONS = [
  { value: "false", label: "No" },
  { value: "true", label: "Yes" },
];

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function displayDate(value: string | null | undefined) {
  return value ? formatDate(value) : "—";
}

function emptyToNull(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

function windowFilled(start: string, end: string): boolean {
  return Boolean(start.trim() && end.trim());
}

/** Count of Test / UAT / Pre-Prod windows that have both start and end. */
function bookedWindows(draft: BookingDraft): number {
  return [
    windowFilled(draft.testStart, draft.testEnd),
    windowFilled(draft.uatStart, draft.uatEnd),
    windowFilled(draft.preProdStart, draft.preProdEnd),
  ].filter(Boolean).length;
}

const TOTAL_WINDOWS = 3;

function conflictTone(flag: boolean): ChipTone {
  return flag ? "bad" : "good";
}

/**
 * Environment windows must all finish before the production date, otherwise the
 * release would go live on testing that has not happened yet.
 *
 * @param draft - Current booking values.
 * @returns Phase names whose end date falls after the production date.
 */
function windowsAfterProd(draft: BookingDraft): string[] {
  const prod = draft.prodReleaseDate;
  if (!prod) return [];
  return (
    [
      ["Test", draft.testEnd],
      ["UAT", draft.uatEnd],
      ["Pre-Prod", draft.preProdEnd],
    ] as const
  )
    .filter(([, end]) => end && end > prod)
    .map(([label]) => label);
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
  const d = edit.draft;

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
    edit.completeSaveSuccess(BOOKING_FIELD_LABELS);
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
  const windowsBooked = bookedWindows(v);
  const selectedRelease = releases.find((r) => r.id === v.releaseId) ?? row.release;
  const openConflicts = row.conflicts.filter((c) => !/resolv|closed/i.test(c.status));
  const firstConflict = openConflicts[0] ?? row.conflicts[0];
  const lateWindows = windowsAfterProd(v);
  const prodDue = describeDue(v.prodReleaseDate);
  const cabDue = describeDue(v.cabDate);
  const shipped = prodDue.state === "overdue";

  const attention = collectAttention([
    {
      id: "open-conflicts",
      when: openConflicts.length > 0,
      tone: "critical",
      label: `${openConflicts.length} unresolved environment conflict${openConflicts.length === 1 ? "" : "s"}`,
      detail: "Another booking overlaps these windows and neither can proceed until it is settled.",
      href: firstConflict ? `/conflicts/${firstConflict.id}` : undefined,
    },
    {
      id: "conflict-flag",
      when: hasConflict && openConflicts.length === 0,
      tone: "warning",
      label: "Conflict flag set with no open conflict record",
      detail: "Either the flag is stale or the clash was never logged.",
    },
    {
      id: "late-windows",
      when: lateWindows.length > 0,
      tone: "critical",
      label: `${lateWindows.join(" and ")} end after the production date`,
      detail: "The release would go live before that testing finishes.",
    },
    {
      id: "windows-missing",
      when: !shipped && windowsBooked < TOTAL_WINDOWS,
      tone: windowsBooked === 0 ? "critical" : "warning",
      label: `${TOTAL_WINDOWS - windowsBooked} of ${TOTAL_WINDOWS} windows not booked`,
      detail: "Unbooked windows cannot be protected from other teams.",
    },
    {
      id: "no-prod-date",
      when: !v.prodReleaseDate,
      tone: "warning",
      label: "No production date",
      detail: "Without a target date the windows cannot be checked for order.",
    },
    {
      id: "no-cab-date",
      when: !shipped && !v.cabDate,
      tone: "warning",
      label: "No CAB date",
    },
    {
      id: "no-release",
      when: !selectedRelease,
      tone: "warning",
      label: "No release linked",
      detail: "An unlinked booking holds an environment for work nobody can trace.",
    },
  ]);

  const signals: DetailFact[] = [
    {
      label: "Windows",
      value: `${windowsBooked}/${TOTAL_WINDOWS}`,
      tone: windowsBooked === TOTAL_WINDOWS ? "good" : windowsBooked === 0 ? "bad" : "warn",
      hint: "How many of Test, UAT and Pre-Prod have both a start and end date booked.",
    },
    {
      label: "Size",
      value: v.releaseSize.trim() || "—",
      hint: "Relative size of the release this booking supports (S / M / L).",
    },
    {
      label: "Conflicts",
      value: String(openConflicts.length),
      tone: openConflicts.length ? "bad" : "neutral",
      hint: "Open clashes with other bookings — settle these before trusting the windows.",
      href: firstConflict ? `/conflicts/${firstConflict.id}` : undefined,
    },
  ];

  const timing: DetailFact[] = [
    {
      label: "CAB",
      value: displayDate(v.cabDate),
      tone: shipped ? "neutral" : dueTone(cabDue.state),
      hint: !shipped && v.cabDate ? cabDue.label : undefined,
    },
    {
      label: "Production",
      value: displayDate(v.prodReleaseDate),
      tone: shipped ? "neutral" : dueTone(prodDue.state),
      hint: !shipped && v.prodReleaseDate ? prodDue.label : undefined,
    },
  ];

  const scope: DetailFact[] = [
    {
      label: "Release",
      value: selectedRelease?.releaseCode ?? "Not linked",
      href: selectedRelease ? `/releases/${selectedRelease.id}` : undefined,
      tone: selectedRelease ? "neutral" : "warn",
    },
    { label: "Application", value: row.application.name },
    { label: "Department", value: row.departmentName ?? "—" },
    {
      label: "Environments",
      value:
        [v.testEnvCode, v.uatEnvCode, v.preProdEnvCode].map((c) => c.trim()).filter(Boolean).join(", ") ||
        "None recorded",
    },
  ];

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
      editError={edit.error}
      onEdit={edit.startEdit}
      onDiscard={edit.discard}
      onSave={save}
      deleteOpen={edit.deleteOpen}
      onDeleteOpen={() => edit.setDeleteOpen(true)}
      onDeleteCancel={() => edit.setDeleteOpen(false)}
      onDeleteConfirm={remove}
      lockedIdLabel="Booking ID"
      successChanges={edit.successChanges}
      onSuccessDismiss={edit.dismissSuccess}
      editForm={
        d ? (
          <EditableFieldGrid cols={2}>
            <EditableField
              label="Release"
              value={d.releaseId}
              editing
              kind="select"
              options={releaseSelectOptions}
              onChange={(n) => edit.setField("releaseId", n)}
            />
            <EditableField
              label="Release Size"
              value={d.releaseSize}
              editing
              onChange={(n) => edit.setField("releaseSize", n)}
              placeholder="S / M / L…"
            />
            <EditableField
              label="Dependencies"
              value={d.dependencies}
              editing
              onChange={(n) => edit.setField("dependencies", n)}
              placeholder="NA or dep codes…"
            />
            <EditableField
              label="Prod Release Date"
              value={d.prodReleaseDate}
              editing
              kind="date"
              onChange={(n) => edit.setField("prodReleaseDate", n)}
            />
            <EditableField
              label="CAB Date"
              value={d.cabDate}
              editing
              kind="date"
              onChange={(n) => edit.setField("cabDate", n)}
            />
            <EditableField
              label="Test Env"
              value={d.testEnvCode}
              editing
              mono
              onChange={(n) => edit.setField("testEnvCode", n)}
            />
            <EditableField
              label="Test Start"
              value={d.testStart}
              editing
              kind="date"
              onChange={(n) => edit.setField("testStart", n)}
            />
            <EditableField
              label="Test End"
              value={d.testEnd}
              editing
              kind="date"
              onChange={(n) => edit.setField("testEnd", n)}
            />
            <EditableField
              label="UAT Env"
              value={d.uatEnvCode}
              editing
              mono
              onChange={(n) => edit.setField("uatEnvCode", n)}
            />
            <EditableField
              label="UAT Start"
              value={d.uatStart}
              editing
              kind="date"
              onChange={(n) => edit.setField("uatStart", n)}
            />
            <EditableField
              label="UAT End"
              value={d.uatEnd}
              editing
              kind="date"
              onChange={(n) => edit.setField("uatEnd", n)}
            />
            <EditableField
              label="Pre-Prod Env"
              value={d.preProdEnvCode}
              editing
              mono
              onChange={(n) => edit.setField("preProdEnvCode", n)}
            />
            <EditableField
              label="Pre-Prod Start"
              value={d.preProdStart}
              editing
              kind="date"
              onChange={(n) => edit.setField("preProdStart", n)}
            />
            <EditableField
              label="Pre-Prod End"
              value={d.preProdEnd}
              editing
              kind="date"
              onChange={(n) => edit.setField("preProdEnd", n)}
            />
            <EditableField
              label="Conflict Flag"
              value={d.conflictFlag}
              editing
              kind="select"
              options={CONFLICT_FLAG_OPTIONS}
              onChange={(n) => edit.setField("conflictFlag", n)}
            />
            <EditableField
              label="Environment Conflict ID"
              value={d.environmentConflictId}
              editing
              mono
              onChange={(n) => edit.setField("environmentConflictId", n)}
              placeholder="CNF-001, CNF-002…"
            />
            <EditableField
              label="Purpose / Notes"
              value={d.purpose}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("purpose", n)}
              placeholder="Why this booking exists…"
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
      <DetailDecisionHeader
        status={{
          label: hasConflict || openConflicts.length ? "Conflict" : "Clear",
          tone: conflictTone(hasConflict || openConflicts.length > 0),
          caption: `${row.application.name}${selectedRelease ? ` · ${selectedRelease.releaseCode}` : ""}`,
        }}
        signals={signals}
        canEdit={canEdit}
        attention={attention}
        attentionClearLabel="Windows are booked and no other team is clashing with them"
        timing={timing}
        timingDescription="CAB and production dates this booking must finish before. If a window ends after production, the release would go live on unfinished testing."
        scope={scope}
        scopeDescription="Which release owns this booking, which application and department, and which environments are reserved."
      />

      <DetailSection
        icon={CalendarCheck}
        tone="sky"
        title="Environment journey"
        description="Full Test → UAT → Pre-Prod → CAB path at a glance."
        detail="Each stage shows the booked dates and duration. A filled stage has both a start and end date. Use this to spot gaps before CAB reviews the release."
      >
        <EntityTimeline
          phases={[
            {
              label: "Test",
              detail: `${displayDate(v.testStart)} → ${displayDate(v.testEnd)} · ${row.testDays ?? "—"} days`,
              tone: "sky",
              complete: windowFilled(v.testStart, v.testEnd),
            },
            {
              label: "UAT",
              detail: `${displayDate(v.uatStart)} → ${displayDate(v.uatEnd)} · ${row.uatDays ?? "—"} days`,
              tone: "violet",
              complete: windowFilled(v.uatStart, v.uatEnd),
            },
            {
              label: "Pre-Prod",
              detail: `${displayDate(v.preProdStart)} → ${displayDate(v.preProdEnd)} · ${row.preProdDays ?? "—"} days`,
              tone: "amber",
              complete: windowFilled(v.preProdStart, v.preProdEnd),
            },
            {
              label: "CAB / Prod",
              detail: `CAB ${displayDate(v.cabDate)} · Prod ${displayDate(v.prodReleaseDate)}`,
              tone: hasConflict ? "rose" : "emerald",
              complete: Boolean(v.cabDate && v.prodReleaseDate),
            },
          ]}
        />
      </DetailSection>

      <DetailSection
        icon={Server}
        tone="sky"
        title="Test environment"
        description="QA window — the first shared slot, and the one that most often clashes."
        detail="Environment code plus start/end dates for Test. Overlaps with another booking on the same Test env usually raise the conflict flag above."
      >
        <EditableFieldGrid cols={3}>
          <EditableField
            label="Test Env"
            value={v.testEnvCode}
            editing={false}
            mono
          />
          <EditableField
            label="Test Start"
            value={v.testStart}
            editing={false}
              display={displayDate(v.testStart)}
          />
          <EditableField
            label="Test End"
            value={v.testEnd}
            editing={false}
              display={displayDate(v.testEnd)}
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
        detail="Environment code and dates for User Acceptance Testing. Business users sign off here before Pre-Prod and CAB."
      >
        <EditableFieldGrid cols={3}>
          <EditableField
            label="UAT Env"
            value={v.uatEnvCode}
            editing={false}
            mono
          />
          <EditableField
            label="UAT Start"
            value={v.uatStart}
            editing={false}
              display={displayDate(v.uatStart)}
          />
          <EditableField
            label="UAT End"
            value={v.uatEnd}
            editing={false}
              display={displayDate(v.uatEnd)}
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
        description="Final dress rehearsal before CAB and production."
        detail="Environment code and dates for the last non-production run. This window should finish before the production date in Timing."
      >
        <EditableFieldGrid cols={3}>
          <EditableField
            label="Pre-Prod Env"
            value={v.preProdEnvCode}
            editing={false}
            mono
          />
          <EditableField
            label="Pre-Prod Start"
            value={v.preProdStart}
            editing={false}
              display={displayDate(v.preProdStart)}
          />
          <EditableField
            label="Pre-Prod End"
            value={v.preProdEnd}
            editing={false}
              display={displayDate(v.preProdEnd)}
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
        icon={FileText}
        tone="amber"
        title="Purpose & dependencies"
        description="Why this booking exists and what it waits on."
        detail="CAB and environment owners read these notes when reshuffling clashes. Dependencies list other work this booking cannot proceed without."
      >
        <EditableFieldGrid>
          <EditableField
            label="Dependencies"
            value={v.dependencies}
            editing={false}
            display={v.dependencies.trim() || "None recorded"}
          />
        </EditableFieldGrid>
        <div className="mt-4">
          <TintedCallout tone="amber">
            {v.purpose.trim() ? v.purpose : "No purpose notes recorded yet."}
          </TintedCallout>
        </div>
      </DetailSection>

      <DetailSection
        icon={AlertTriangle}
        tone="rose"
        title="Linked conflicts"
        description="Conflict records that must be settled before these windows are reliable."
        detail="Each chip opens the conflict detail page. Unresolved conflicts mean another booking overlaps this one — coordinate or reschedule before relying on the dates above."
      >
        {row.conflicts.length === 0 ? (
          <div className="space-y-2">
            <p className="text-[13px] text-slate-500 dark:text-white/55">No linked conflicts.</p>
            {v.environmentConflictId.trim() ? (
              <p className="text-[13px] text-slate-500 dark:text-white/55">
                Referenced codes:{" "}
                <ConflictLinks raw={v.environmentConflictId} conflicts={row.conflicts} />
              </p>
            ) : null}
          </div>
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
