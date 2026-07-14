"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  GanttChartSquare,
  LayoutGrid,
  Plus,
  Table2,
} from "lucide-react";
import {
  FilterRangeInputs,
  FilterSelect,
  FilterTextInput,
  FilterTriState,
  TableFilterBar,
} from "@/components/filters/TableFilterBar";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { TopBar } from "@/components/layout/TopBar";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { BookingFormModal } from "@/components/booking/BookingFormModal";
import { BookingMonthGrid } from "@/components/booking/BookingMonthGrid";
import { BookingTimelineGantt } from "@/components/booking/BookingTimelineGantt";
import {
  BOOKING_COLUMNS,
  BOOKING_DEFAULT_HIDDEN_COLUMN_KEYS,
  BOOKING_DEFAULT_HIDDEN_FILTER_KEYS,
  BOOKING_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { BOOKING_SORT_PRESETS } from "@/lib/table-sort-presets";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { useFilteredFetch } from "@/hooks/useTableFilters";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { BOOKING_FILTER_SCHEMA, SELECT_CLASS } from "@/lib/table-filters";
import { periodTitle, shiftPeriodAnchor } from "@/lib/calendar-schedule";
import { PERIOD_OPTIONS } from "@/lib/period-labels";
import { timelineRangeLabel } from "@/lib/release-timeline";
import { periodRange, type Period } from "@/lib/period-range";
import { loadJsonEffect, safeFetchJson } from "@/lib/safe-fetch";
import { taBtnPrimary } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth/roles";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";

type BookingDisplay = "calendar" | "timeline" | "table";

type BookingRow = {
  id: string;
  bookingCode: string | null;
  application: { id: string; name: string; department?: { name: string } };
  release?: { id: string; releaseCode: string } | null;
  departmentName?: string | null;
  dependencies?: string | null;
  releaseSize?: string | null;
  prodReleaseDate?: string | null;
  cabDate?: string | null;
  testEnvCode?: string | null;
  testStart?: string | null;
  testEnd?: string | null;
  testDays?: number | null;
  uatEnvCode?: string | null;
  uatStart?: string | null;
  uatEnd?: string | null;
  uatDays?: number | null;
  preProdEnvCode?: string | null;
  preProdStart?: string | null;
  preProdEnd?: string | null;
  preProdDays?: number | null;
  conflictFlag: boolean;
  purpose?: string | null;
  environmentConflictId?: string | null;
};

type BookingColumnKey = (typeof BOOKING_COLUMNS)[number]["key"];

function fmtDate(v?: string | null) {
  if (!v) return "";
  return new Date(v).toISOString().slice(0, 10);
}

function cellValue(row: BookingRow, key: BookingColumnKey) {
  switch (key) {
    case "bookingCode":
      return row.bookingCode ?? "";
    case "releaseId":
      return row.release?.releaseCode ?? "";
    case "application":
      return row.application?.name ?? "";
    case "department":
      return row.departmentName ?? row.application?.department?.name ?? "";
    case "dependencies":
      return row.dependencies ?? "NA";
    case "releaseSize":
      return row.releaseSize ?? "";
    case "prodReleaseDate":
      return fmtDate(row.prodReleaseDate);
    case "cabDate":
      return fmtDate(row.cabDate);
    case "testEnvCode":
      return row.testEnvCode ?? "";
    case "testStart":
      return fmtDate(row.testStart);
    case "testEnd":
      return fmtDate(row.testEnd);
    case "testDays":
      return row.testDays ?? "";
    case "uatEnvCode":
      return row.uatEnvCode ?? "";
    case "uatStart":
      return fmtDate(row.uatStart);
    case "uatEnd":
      return fmtDate(row.uatEnd);
    case "uatDays":
      return row.uatDays ?? "";
    case "preProdEnvCode":
      return row.preProdEnvCode ?? "";
    case "preProdStart":
      return fmtDate(row.preProdStart);
    case "preProdEnd":
      return fmtDate(row.preProdEnd);
    case "preProdDays":
      return row.preProdDays ?? "";
    case "conflictFlag":
      return row.conflictFlag ? "⚠️ CONFLICT" : "";
    case "notes":
      return row.purpose ?? "";
    case "environmentConflictId":
      return row.environmentConflictId ?? "";
    default:
      return "";
  }
}

function parseConflictCodes(raw: string): string[] {
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && c !== "—");
}

function ConflictIdLinks({ raw }: { raw: string }) {
  const codes = parseConflictCodes(raw);
  if (!codes.length) return <>{raw || "—"}</>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {codes.map((code, i) => (
        <span key={code} className="inline-flex items-center">
          {i > 0 && <span className="text-gray-400 mr-1">,</span>}
          <ProgressLink
            href={`/conflicts/${encodeURIComponent(code)}`}
            className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
          >
            {code}
          </ProgressLink>
        </span>
      ))}
    </span>
  );
}

export default function BookingContent() {
  const {
    rows: bookings,
    loading,
    values,
    setFilter,
    setSort,
    clearAll,
    hasActive,
    sortKey,
    sortDir,
    toggleSort,
    refetch,
  } = useFilteredFetch<BookingRow>("/api/bookings", BOOKING_FILTER_SCHEMA, {
    defaultSortKey: "bookingCode",
    defaultSortDir: "asc",
    sortAccessors: {
      bookingCode: (r) => r.bookingCode ?? "",
      releaseId: (r) => r.release?.releaseCode ?? "",
      application: (r) => r.application?.name ?? "",
      department: (r) => r.departmentName ?? r.application?.department?.name ?? "",
      dependencies: (r) => r.dependencies ?? "",
      releaseSize: (r) => r.releaseSize ?? "",
      prodReleaseDate: (r) => (r.prodReleaseDate ? new Date(r.prodReleaseDate).getTime() : 0),
      cabDate: (r) => (r.cabDate ? new Date(r.cabDate).getTime() : 0),
      testEnvCode: (r) => r.testEnvCode ?? "",
      testStart: (r) => (r.testStart ? new Date(r.testStart).getTime() : 0),
      testEnd: (r) => (r.testEnd ? new Date(r.testEnd).getTime() : 0),
      testDays: (r) => r.testDays ?? 0,
      uatEnvCode: (r) => r.uatEnvCode ?? "",
      uatStart: (r) => (r.uatStart ? new Date(r.uatStart).getTime() : 0),
      uatEnd: (r) => (r.uatEnd ? new Date(r.uatEnd).getTime() : 0),
      uatDays: (r) => r.uatDays ?? 0,
      preProdEnvCode: (r) => r.preProdEnvCode ?? "",
      preProdStart: (r) => (r.preProdStart ? new Date(r.preProdStart).getTime() : 0),
      preProdEnd: (r) => (r.preProdEnd ? new Date(r.preProdEnd).getTime() : 0),
      preProdDays: (r) => r.preProdDays ?? 0,
      conflictFlag: (r) => (r.conflictFlag ? 1 : 0),
      notes: (r) => r.purpose ?? "",
      environmentConflictId: (r) => r.environmentConflictId ?? "",
    },
  });
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [apps, setApps] = useState<{ id: string; name: string; departmentId: string }[]>([]);
  const [envs, setEnvs] = useState<{ id: string; name: string; applicationId: string; application: { name: string } }[]>([]);
  const [releases, setReleases] = useState<
    { id: string; releaseCode: string; name: string; applications?: { application: { id: string } }[] }[]
  >([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [display, setDisplay] = useState<BookingDisplay>("table");
  const [period, setPeriod] = useState<Period>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [focusDayIso, setFocusDayIso] = useState<string | null>(null);
  const [highlightCode, setHighlightCode] = useState<string | null>(null);
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  const canEdit = sessionCanEdit(user);

  useEffect(() => {
    return loadJsonEffect<{ user: SessionUser }>("/api/auth/me", (data) => setUser(data.user), {
      label: "booking-auth",
    });
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [deptRes, appsRes, envsRes, relRes] = await Promise.all([
        safeFetchJson<{ id: string; name: string }[]>("/api/departments", { signal: ac.signal, label: "departments" }),
        safeFetchJson<{ id: string; name: string; departmentId: string }[]>("/api/applications", { signal: ac.signal, label: "applications" }),
        safeFetchJson<{ id: string; name: string; applicationId: string; application: { name: string } }[]>(
          "/api/environments",
          { signal: ac.signal, label: "environments" },
        ),
        safeFetchJson<
          { id: string; releaseCode: string; name: string; applications?: { application: { id: string } }[] }[]
        >("/api/releases", {
          signal: ac.signal,
          label: "releases",
        }),
      ]);
      if (ac.signal.aborted) return;
      if (deptRes.ok) setDepartments(deptRes.data);
      if (appsRes.ok) setApps(appsRes.data);
      if (envsRes.ok) setEnvs(envsRes.data);
      if (relRes.ok) setReleases(relRes.data);
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (display !== "table" || !highlightCode) return;
    const t = window.setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [display, highlightCode, bookings]);

  const appOptions = useMemo(
    () => (values.departmentId ? apps.filter((a) => a.departmentId === values.departmentId) : apps),
    [apps, values.departmentId]
  );

  const releaseSizes = useMemo(
    () => [...new Set(bookings.map((b) => (b.releaseSize ?? "").trim()).filter(Boolean))].sort(),
    [bookings]
  );

  const { start: periodStart, end: periodEnd } = useMemo(
    () => periodRange(period, anchor),
    [period, anchor]
  );

  const navLabel = useMemo(
    () =>
      display === "timeline"
        ? timelineRangeLabel(periodStart, periodEnd)
        : periodTitle(period, anchor),
    [display, period, anchor, periodStart, periodEnd]
  );

  const selectBookingInTable = (bookingCode: string) => {
    setFilter("bookingCodeQ", bookingCode);
    setHighlightCode(bookingCode);
    setFocusDayIso(null);
    setDisplay("table");
  };

  const showDayOnTimeline = (dayIso: string) => {
    setFocusDayIso(dayIso);
    setDisplay("timeline");
  };

  const { visibleColumns, isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "env-booking",
    BOOKING_COLUMNS,
    BOOKING_FILTER_FIELDS,
    {
      lockedKeys: ["bookingCode"],
      defaultHiddenFilters: BOOKING_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: BOOKING_DEFAULT_HIDDEN_COLUMN_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  const viewSwitcher = (
    <div className="flex items-center gap-1 rounded-2xl bg-slate-50 p-1 dark:bg-slate-900/60 dark:ring-1 dark:ring-slate-700 sm:gap-1.5 sm:p-1.5">
      {(
        [
          { id: "calendar" as const, label: "Calendar", Icon: LayoutGrid },
          { id: "timeline" as const, label: "Timeline", Icon: GanttChartSquare },
          { id: "table" as const, label: "Table", Icon: Table2 },
        ] as const
      ).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => {
            setDisplay(id);
            if (id !== "timeline") setFocusDayIso(null);
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] font-semibold transition-all sm:px-4 sm:text-[13px]",
            display === id
              ? "text-white shadow-md"
              : "text-slate-500 hover:bg-white dark:text-white/60 dark:hover:bg-white/5"
          )}
          style={display === id ? { backgroundImage: "var(--theme-gradient)" } : undefined}
          aria-label={label}
        >
          <Icon size={15} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6 pb-12 font-sans">
      <TopBar
        pageKey="env-booking"
        title="Environment Booking"
        subtitle={`${bookings.length} booking${bookings.length === 1 ? "" : "s"}`}
        trailing={
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canEdit && (
              <button type="button" className={cn(taBtnPrimary, "text-sm")} onClick={() => setModalOpen(true)}>
                <Plus className="mr-1 inline h-4 w-4" /> New Booking
              </button>
            )}
            <PageDocumentation pageKey="env-booking" />
          </div>
        }
      />

      <BookingFormModal
        open={modalOpen}
        departments={departments.map((d) => ({ value: d.id, label: d.name }))}
        applications={apps.map((a) => ({
          value: a.id,
          label: a.name,
          departmentId: a.departmentId,
        }))}
        environments={envs.map((e) => ({
          value: e.id,
          label: e.name,
          applicationId: e.applicationId,
        }))}
        releases={releases.map((r) => ({
          value: r.id,
          label: `${r.releaseCode} — ${r.name}`,
          applicationIds: r.applications?.map((a) => a.application.id) ?? [],
        }))}
        onClose={() => setModalOpen(false)}
        onSaved={() => refetch()}
      />

      {/* View chrome always mounts — avoids SSR/client tree mismatch while prefs load */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {(display === "calendar" || display === "timeline") && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={cn(SELECT_CLASS, "h-8 min-w-0 flex-1 text-xs font-semibold sm:min-w-[110px] sm:flex-none")}
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value as Period);
                setFocusDayIso(null);
              }}
              aria-label="Period grain"
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setAnchor(shiftPeriodAnchor(period, anchor, -1));
                setFocusDayIso(null);
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-white/5"
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-slate-800 dark:text-white sm:min-w-[100px] sm:flex-none">
              {navLabel}
            </span>
            <button
              type="button"
              onClick={() => {
                setAnchor(shiftPeriodAnchor(period, anchor, 1));
                setFocusDayIso(null);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-white/5"
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
        {viewSwitcher}
        {focusDayIso && display === "timeline" && (
          <button
            type="button"
            onClick={() => setFocusDayIso(null)}
            className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
          >
            Clear day focus
          </button>
        )}
      </div>

      {!tablePending && (
        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
          {isFilterVisible("departmentId") && (
            <FilterSelect value={values.departmentId} onChange={(v) => setFilter("departmentId", v)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("applicationId") && (
            <FilterSelect value={values.applicationId} onChange={(v) => setFilter("applicationId", v)}>
              <option value="">All applications</option>
              {appOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("environmentId") && (
            <FilterSelect value={values.environmentId} onChange={(v) => setFilter("environmentId", v)}>
              <option value="">All environments</option>
              {envs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.application.name} — {e.name}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("conflictFlag") && (
            <FilterTriState
              value={values.conflictFlag}
              onChange={(v) => setFilter("conflictFlag", v)}
              yesLabel="Conflicts only"
              noLabel="No conflicts"
              allLabel="All bookings"
            />
          )}
          {isFilterVisible("releaseCodeQ") && (
            <FilterTextInput
              value={values.releaseCodeQ}
              onChange={(v) => setFilter("releaseCodeQ", v)}
              placeholder="Release ID…"
            />
          )}
          {isFilterVisible("releaseSize") && (
            <FilterSelect value={values.releaseSize} onChange={(v) => setFilter("releaseSize", v)}>
              <option value="">All sizes</option>
              {releaseSizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("bookingCodeQ") && (
            <FilterTextInput
              value={values.bookingCodeQ}
              onChange={(v) => {
                setFilter("bookingCodeQ", v);
                if (!v) setHighlightCode(null);
              }}
              placeholder="Booking ID…"
            />
          )}
          {isFilterVisible("dependenciesQ") && (
            <FilterTextInput
              value={values.dependenciesQ}
              onChange={(v) => setFilter("dependenciesQ", v)}
              placeholder="Dependencies…"
            />
          )}
          {isFilterVisible("prodReleaseDateQ") && (
            <FilterTextInput
              value={values.prodReleaseDateQ}
              onChange={(v) => setFilter("prodReleaseDateQ", v)}
              placeholder="Prod date…"
            />
          )}
          {isFilterVisible("cabDateQ") && (
            <FilterTextInput
              value={values.cabDateQ}
              onChange={(v) => setFilter("cabDateQ", v)}
              placeholder="CAB date…"
            />
          )}
          {isFilterVisible("testEnvCodeQ") && (
            <FilterTextInput
              value={values.testEnvCodeQ}
              onChange={(v) => setFilter("testEnvCodeQ", v)}
              placeholder="Test env…"
            />
          )}
          {isFilterVisible("testStartQ") && (
            <FilterTextInput
              value={values.testStartQ}
              onChange={(v) => setFilter("testStartQ", v)}
              placeholder="Test start…"
            />
          )}
          {isFilterVisible("testEndQ") && (
            <FilterTextInput
              value={values.testEndQ}
              onChange={(v) => setFilter("testEndQ", v)}
              placeholder="Test end…"
            />
          )}
          {isFilterVisible("testDays") && (
            <div className="inline-flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Test days</span>
              <FilterRangeInputs
                minValue={values.testDaysMin}
                maxValue={values.testDaysMax}
                onMinChange={(v) => setFilter("testDaysMin", v)}
                onMaxChange={(v) => setFilter("testDaysMax", v)}
              />
            </div>
          )}
          {isFilterVisible("uatEnvCodeQ") && (
            <FilterTextInput
              value={values.uatEnvCodeQ}
              onChange={(v) => setFilter("uatEnvCodeQ", v)}
              placeholder="UAT env…"
            />
          )}
          {isFilterVisible("uatStartQ") && (
            <FilterTextInput
              value={values.uatStartQ}
              onChange={(v) => setFilter("uatStartQ", v)}
              placeholder="UAT start…"
            />
          )}
          {isFilterVisible("uatEndQ") && (
            <FilterTextInput
              value={values.uatEndQ}
              onChange={(v) => setFilter("uatEndQ", v)}
              placeholder="UAT end…"
            />
          )}
          {isFilterVisible("uatDays") && (
            <div className="inline-flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">UAT days</span>
              <FilterRangeInputs
                minValue={values.uatDaysMin}
                maxValue={values.uatDaysMax}
                onMinChange={(v) => setFilter("uatDaysMin", v)}
                onMaxChange={(v) => setFilter("uatDaysMax", v)}
              />
            </div>
          )}
          {isFilterVisible("preProdEnvCodeQ") && (
            <FilterTextInput
              value={values.preProdEnvCodeQ}
              onChange={(v) => setFilter("preProdEnvCodeQ", v)}
              placeholder="Pre-Prod env…"
            />
          )}
          {isFilterVisible("preProdStartQ") && (
            <FilterTextInput
              value={values.preProdStartQ}
              onChange={(v) => setFilter("preProdStartQ", v)}
              placeholder="Pre-Prod start…"
            />
          )}
          {isFilterVisible("preProdEndQ") && (
            <FilterTextInput
              value={values.preProdEndQ}
              onChange={(v) => setFilter("preProdEndQ", v)}
              placeholder="Pre-Prod end…"
            />
          )}
          {isFilterVisible("preProdDays") && (
            <div className="inline-flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pre-Prod days</span>
              <FilterRangeInputs
                minValue={values.preProdDaysMin}
                maxValue={values.preProdDaysMax}
                onMinChange={(v) => setFilter("preProdDaysMin", v)}
                onMaxChange={(v) => setFilter("preProdDaysMax", v)}
              />
            </div>
          )}
          {isFilterVisible("notesQ") && (
            <FilterTextInput
              value={values.notesQ}
              onChange={(v) => setFilter("notesQ", v)}
              placeholder="Notes…"
            />
          )}
          {isFilterVisible("environmentConflictIdQ") && (
            <FilterTextInput
              value={values.environmentConflictIdQ}
              onChange={(v) => setFilter("environmentConflictIdQ", v)}
              placeholder="Env conflict ID…"
            />
          )}
        </TableFilterBar>
      )}

      {tablePending ? (
        <TableSkeleton showTitle={false} columns={BOOKING_COLUMNS.length} />
      ) : (
        <div className="space-y-4">
          {display === "calendar" && (
            <BookingMonthGrid
              bookings={bookings}
              viewDate={anchor}
              period={period}
              onSelectBooking={selectBookingInTable}
              onShowDayOnTimeline={showDayOnTimeline}
            />
          )}

          {display === "timeline" && (
            <BookingTimelineGantt
              bookings={bookings}
              viewDate={anchor}
              period={period}
              focusDayIso={focusDayIso}
              onSelectBooking={selectBookingInTable}
            />
          )}

          {display === "table" && (
            <DataTable
              title="All Bookings"
              icon={CalendarCheck}
              toolbar={
                <TablePageToolbar
                  columnPicker={columnPicker}
                  presets={BOOKING_SORT_PRESETS}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSelectSort={setSort}
                />
              }
            >
              <table className={dataTableTableClass}>
                <thead>
                  <DataTableHeadRow
                    columns={BOOKING_COLUMNS}
                    isColumnVisible={isColumnVisible}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                </thead>
                <tbody>
                  {bookings.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length} className="p-4 text-center text-gray-500">
                        {hasActive ? "No bookings match filters." : "No data found."}
                      </td>
                    </tr>
                  ) : (
                    bookings.map((row) => {
                      const code = row.bookingCode ?? "";
                      const highlighted = highlightCode && code === highlightCode;
                      return (
                        <tr
                          key={row.id}
                          ref={highlighted ? highlightRef : undefined}
                          data-booking-code={code}
                          className={cn(
                            tableRow,
                            highlighted && "bg-brand-50/80 ring-1 ring-inset ring-brand-300 dark:bg-brand-500/10 dark:ring-brand-500/40"
                          )}
                        >
                          {visibleColumns.map((col) => {
                            const key = col.key as BookingColumnKey;
                            const value = cellValue(row, key);
                            const isConflict = col.key === "conflictFlag" && row.conflictFlag;
                            const isNotes = col.key === "notes";
                            const displayVal =
                              value !== ""
                                ? value
                                : col.key === "dependencies"
                                  ? "NA"
                                  : col.key === "conflictFlag" || col.key === "notes"
                                    ? ""
                                    : "—";
                            return (
                              <td
                                key={col.key}
                                className={cn(
                                  tableCell,
                                  "whitespace-nowrap",
                                  col.key === "releaseId" && "text-brand-600 dark:text-brand-400",
                                  isConflict && "font-medium text-error-600 dark:text-rose-400",
                                  isNotes && "max-w-[280px] truncate"
                                )}
                                title={isNotes ? String(value) : undefined}
                              >
                                {col.key === "bookingCode" && row.id ? (
                                  <ProgressLink
                                    href={`/booking/${row.id}`}
                                    className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
                                  >
                                    {displayVal}
                                  </ProgressLink>
                                ) : col.key === "releaseId" && row.release?.id && row.release.releaseCode ? (
                                  <ProgressLink
                                    href={`/releases/${row.release.id}`}
                                    className="text-brand-600 hover:underline dark:text-brand-400"
                                  >
                                    {row.release.releaseCode}
                                  </ProgressLink>
                                ) : col.key === "environmentConflictId" && String(value).trim() ? (
                                  <ConflictIdLinks raw={String(value)} />
                                ) : (
                                  displayVal
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </DataTable>
          )}
        </div>
      )}
    </div>
  );
}
