"use client";

import { useMemo, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, GanttChartSquare, Plus, Table2 } from "lucide-react";
import { MonthGridCalendar } from "@/components/calendar/MonthGridCalendar";
import { ReleaseTimelineView } from "@/components/calendar/ReleaseTimelineView";
import { CalendarTableView } from "@/components/calendar/CalendarTableView";
import { CalendarStatusLegend } from "@/components/calendar/CalendarStatusLegend";
import { CalendarEventCreateModal } from "@/components/calendar/CalendarEventCreateModal";
import { ReleaseFiltersBar } from "@/components/releases/ReleaseFiltersBar";
import { FilterSelect } from "@/components/filters/TableFilterControls";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { TopBar } from "@/components/layout/TopBar";
import { useFilterPreferences } from "@/hooks/useFilterPreferences";
import { useReleaseFilters } from "@/context/ReleaseFiltersContext";
import { loadJsonEffect } from "@/lib/safe-fetch";
import { canEdit as sessionCanEdit, type SessionUser } from "@/lib/auth/roles";
import { taBtnPrimary } from "@/lib/styles";
import {
  CALENDAR_DEFAULT_HIDDEN_FILTER_KEYS,
  CALENDAR_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { periodTitle, shiftPeriodAnchor } from "@/lib/calendar-schedule";
import {
  CALENDAR_DAY_OPTIONS,
  CALENDAR_SIZE_IMPACT_OPTIONS,
  filterCalendarEvents,
  type CalendarEventApi,
} from "@/lib/calendar-table";
import { inPeriod, periodRange, type Period } from "@/lib/period-range";
import { filterUnifiedReleases } from "@/lib/release-filters";
import { timelineRangeLabel } from "@/lib/release-timeline";
import {
  dbToUnified,
  getDemoReleasesInPeriod,
  mergeReleases,
} from "@/lib/unified-releases";
import { SELECT_CLASS } from "@/lib/table-filters";
import { cn } from "@/lib/utils";

type CalendarDisplay = "calendar" | "timeline" | "table";

const EVENT_TYPE_OPTIONS = [
  "CAB MEETING",
  "RELEASE",
  "CHANGE FREEZE",
  "REGULATORY",
  "VENDOR MAINT",
] as const;

export default function CalendarPage() {
  const {
    filters,
    loading,
    departments,
    applications,
    environments,
    bookings,
    dbRows,
    calendarEvents,
    setPeriod,
    setAnchor,
    setFilter,
    refreshLookups,
  } = useReleaseFilters();

  const { filterPicker, isFilterVisible } = useFilterPreferences("calendar", CALENDAR_FILTER_FIELDS, {
    defaultHiddenFilters: CALENDAR_DEFAULT_HIDDEN_FILTER_KEYS,
  });

  const period = (filters.period || "month") as Period;
  const viewDate = useMemo(() => {
    if (filters.anchor) {
      const d = new Date(filters.anchor);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  }, [filters.anchor]);

  const [display, setDisplay] = useState<CalendarDisplay>("calendar");
  const [mounted, setMounted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const canEdit = sessionCanEdit(user);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    return loadJsonEffect<{ user: SessionUser }>("/api/auth/me", (data) => setUser(data.user), {
      label: "calendar-auth",
    });
  }, []);

  const { start: periodStart, end: periodEnd } = useMemo(
    () => periodRange(period, viewDate),
    [period, viewDate],
  );

  const eventTypeOptions = useMemo(() => {
    const set = new Set<string>([...EVENT_TYPE_OPTIONS]);
    for (const e of calendarEvents as CalendarEventApi[]) {
      if (e.eventType) set.add(e.eventType);
    }
    return [...set].sort();
  }, [calendarEvents]);

  const sizeImpactOptions = useMemo(() => {
    const set = new Set<string>([...CALENDAR_SIZE_IMPACT_OPTIONS]);
    for (const e of calendarEvents as CalendarEventApi[]) {
      if (e.sizeImpact) set.add(e.sizeImpact);
    }
    return [...set].sort();
  }, [calendarEvents]);

  const filteredEvents = useMemo(() => {
    return filterCalendarEvents(calendarEvents as CalendarEventApi[], {
      period,
      viewDate,
      filters,
    });
  }, [calendarEvents, period, viewDate, filters]);

  const timelineReleases = useMemo(() => {
    const dbUnified = (dbRows as unknown as Parameters<typeof dbToUnified>[0][]).map(dbToUnified);
    const demoInPeriod = getDemoReleasesInPeriod(period, viewDate);
    const merged = mergeReleases(dbUnified, demoInPeriod);
    const filtered = filterUnifiedReleases(
      merged,
      filters,
      dbRows,
      bookings,
      environments,
      departments,
      applications,
    );
    let rows = filtered.filter((r) => inPeriod(r.date, period, viewDate));
    if (filters.status) rows = rows.filter((r) => r.status === filters.status);
    if (filters.priority) rows = rows.filter((r) => r.priority === filters.priority);
    if (filters.impact) rows = rows.filter((r) => r.impact === filters.impact);
    return rows;
  }, [dbRows, period, viewDate, filters, bookings, environments, departments, applications]);

  const prevPeriod = () => setAnchor(shiftPeriodAnchor(period, viewDate, -1).toISOString().slice(0, 10));
  const nextPeriod = () => setAnchor(shiftPeriodAnchor(period, viewDate, 1).toISOString().slice(0, 10));

  const navLabel = useMemo(
    () =>
      display === "timeline"
        ? timelineRangeLabel(periodStart, periodEnd)
        : periodTitle(period, viewDate),
    [display, period, viewDate, periodStart, periodEnd],
  );

  const countBadge =
    display === "timeline"
      ? timelineReleases.length > 0
        ? `${timelineReleases.length} releases`
        : null
      : filteredEvents.length > 0
        ? `${filteredEvents.length} events`
        : null;

  if (!mounted) return null;

  return (
    <div className="w-full space-y-4">
      {/* One connected control cluster: filters + view/nav */}
      <section
        className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-sm dark:border-[var(--border)] dark:bg-[var(--card)]"
        aria-label="Calendar controls"
      >
        <ReleaseFiltersBar
          className="mb-0 rounded-none border-0 border-b border-gray-100 shadow-none dark:border-slate-700"
          period={period}
          onPeriodChange={(p) => setPeriod(p)}
          showListFilters
          manageFilters={filterPicker}
          isFilterVisible={isFilterVisible}
        >
          {/* Calendar-only controls — not part of shared ReleaseFiltersBar defaults */}
          {isFilterVisible("eventType") && (
            <FilterSelect
              disabled={loading}
              value={filters.eventType}
              onChange={(v) => setFilter("eventType", v)}
            >
              <option value="">All event types</option>
              {eventTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("sizeImpact") && (
            <FilterSelect
              disabled={loading}
              value={filters.sizeImpact}
              onChange={(v) => setFilter("sizeImpact", v)}
            >
              <option value="">All sizes/impacts</option>
              {sizeImpactOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("day") && (
            <FilterSelect
              disabled={loading}
              value={filters.day}
              onChange={(v) => setFilter("day", v)}
            >
              <option value="">All days</option>
              {CALENDAR_DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("dateRange") && (
            <div className="inline-flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Date</span>
              <input
                type="date"
                disabled={loading}
                value={filters.dateFrom}
                onChange={(e) => setFilter("dateFrom", e.target.value)}
                className={cn(SELECT_CLASS, "min-w-0 flex-1 sm:min-w-[132px] sm:flex-none")}
                aria-label="Date from"
              />
              <span className="text-xs text-gray-400">–</span>
              <input
                type="date"
                disabled={loading}
                value={filters.dateTo}
                onChange={(e) => setFilter("dateTo", e.target.value)}
                className={cn(SELECT_CLASS, "min-w-0 flex-1 sm:min-w-[132px] sm:flex-none")}
                aria-label="Date to"
              />
            </div>
          )}
        </ReleaseFiltersBar>

        <div className="px-4 pb-4 pt-4 sm:px-5">
          <TopBar
            className="mb-3"
            pageKey="calendar"
            title="Release Calendar"
            subtitle={countBadge || undefined}
            trailing={
              <div className="flex flex-wrap items-center gap-2">
                <PageDocumentation pageKey="calendar" />
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
                      onClick={() => setDisplay(id)}
                      aria-label={label}
                      className={cn(
                        "flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] font-semibold transition-all sm:px-4 sm:text-[13px]",
                        display === id
                          ? "text-white shadow-md"
                          : "text-slate-500 hover:bg-white dark:text-white/60 dark:hover:bg-white/5",
                      )}
                      style={display === id ? { backgroundImage: "var(--theme-gradient)" } : undefined}
                    >
                      <Icon size={15} />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            }
          />

          {canEdit && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                className={cn(taBtnPrimary, "text-sm")}
                onClick={() => setModalOpen(true)}
              >
                <Plus className="mr-1 inline h-4 w-4" />
                Add Calendar Entry
              </button>
            </div>
          )}

          <CalendarStatusLegend className="mb-3" />

          <div className="mb-1 flex items-center justify-center gap-2 sm:gap-4">
            <button
              type="button"
              onClick={prevPeriod}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-white/5"
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-gray-800 dark:text-white sm:min-w-[160px] sm:flex-none">
              {navLabel}
            </span>
            <button
              type="button"
              onClick={nextPeriod}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-white/5"
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          className={cn(
            "bg-gray-50/30 p-4 pt-4 dark:bg-transparent sm:p-6",
            display === "timeline" && "overflow-visible pt-2",
          )}
        >
          {display === "calendar" ? (
            <>
              {filteredEvents.length === 0 && calendarEvents.length > 0 && (
                <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-600 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  {calendarEvents.length} events loaded — none match this period/filters. Adjust filters or navigate.
                </div>
              )}
              {calendarEvents.length === 0 && loading && (
                <div className="mb-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400 dark:border-slate-700 dark:bg-slate-900/40">
                  Loading calendar events…
                </div>
              )}
              <MonthGridCalendar
                events={filteredEvents}
                viewDate={viewDate}
                onShowDayOnTimeline={() => setDisplay("timeline")}
              />
            </>
          ) : display === "timeline" ? (
            <ReleaseTimelineView
              releases={timelineReleases}
              periodStart={periodStart}
              periodEnd={periodEnd}
              period={period}
            />
          ) : (
            <CalendarTableView events={filteredEvents} dataLoading={loading} />
          )}
        </div>
      </section>

      <CalendarEventCreateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => refreshLookups()}
        eventTypes={eventTypeOptions}
      />
    </div>
  );
}
