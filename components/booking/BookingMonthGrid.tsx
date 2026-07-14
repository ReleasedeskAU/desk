"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  BOOKING_MILESTONE_STYLE,
  BOOKING_PHASE_STYLE,
  bookingMilestones,
  bookingPhaseSegments,
  localDateIso,
  milestoneInPeriod,
  segmentInPeriod,
  segmentsForDay,
  spanEdge,
  type BookingMilestone,
  type BookingPhaseSource,
} from "@/lib/booking-calendar";
import { periodTitle } from "@/lib/calendar-schedule";
import type { Period } from "@/lib/period-range";
import { cn } from "@/lib/utils";

const MAX_VISIBLE = 3;

/** One compact milestone chip per day — avoids stacking CAB/Prod dots beside the date. */
function DayMilestoneChip({
  milestones,
  onSelectBooking,
}: {
  milestones: BookingMilestone[];
  onSelectBooking: (bookingCode: string) => void;
}) {
  if (milestones.length === 0) return null;

  const kinds = [...new Set(milestones.map((m) => m.kind))];
  const hasConflict = milestones.some((m) => m.conflict);
  const label = kinds.map((k) => BOOKING_MILESTONE_STYLE[k].label).join("·");
  const primary = BOOKING_MILESTONE_STYLE[kinds[0]!];
  const title = milestones.map((m) => `${m.label} · ${m.bookingCode}`).join("\n");

  return (
    <button
      type="button"
      title={title}
      onClick={() => onSelectBooking(milestones[0]!.bookingCode)}
      className={cn(
        "inline-flex max-w-[4.5rem] shrink-0 items-center gap-0.5 truncate rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none",
        primary.wash
      )}
    >
      {hasConflict ? <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-rose-600 dark:text-rose-300" aria-hidden /> : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function BookingMonthGrid({
  bookings,
  viewDate,
  period,
  onSelectBooking,
  onShowDayOnTimeline,
}: {
  bookings: BookingPhaseSource[];
  viewDate: Date;
  period: Period;
  onSelectBooking: (bookingCode: string) => void;
  onShowDayOnTimeline: (dayIso: string) => void;
}) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const segments = useMemo(() => {
    return bookingPhaseSegments(bookings).filter((s) => segmentInPeriod(s, period, viewDate));
  }, [bookings, period, viewDate]);

  const milestones = useMemo(() => {
    return bookingMilestones(bookings).filter((m) => milestoneInPeriod(m, period, viewDate));
  }, [bookings, period, viewDate]);

  const milestonesByDay = useMemo(() => {
    const map = new Map<string, typeof milestones>();
    for (const m of milestones) {
      if (!map.has(m.dateIso)) map.set(m.dateIso, []);
      map.get(m.dateIso)!.push(m);
    }
    return map;
  }, [milestones]);

  const { gridDays } = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = firstDay + daysInMonth;
    const paddingAfter = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    const prevMonthDays = new Date(year, month, 0).getDate();

    const blankBefore = Array.from({ length: firstDay }, (_, i) => {
      const d = new Date(year, month - 1, prevMonthDays - firstDay + i + 1);
      return { date: d, isCurrentMonth: false, dayStr: localDateIso(d) };
    });
    const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return { date: d, isCurrentMonth: true, dayStr: localDateIso(d) };
    });
    const blankAfter = Array.from({ length: paddingAfter }, (_, i) => {
      const d = new Date(year, month + 1, i + 1);
      return { date: d, isCurrentMonth: false, dayStr: localDateIso(d) };
    });
    return { gridDays: [...blankBefore, ...monthDays, ...blankAfter] };
  }, [viewDate]);

  const todayStr = useMemo(() => localDateIso(new Date()), []);

  const agendaDays = useMemo(() => {
    return gridDays
      .filter((cell) => cell.isCurrentMonth)
      .map((cell) => {
        const daySegs = segmentsForDay(segments, cell.dayStr);
        const dayMs = milestonesByDay.get(cell.dayStr) ?? [];
        return { ...cell, daySegs, dayMs };
      })
      .filter((d) => d.daySegs.length > 0 || d.dayMs.length > 0);
  }, [gridDays, segments, milestonesByDay]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-600 dark:text-white/70">
        <span className="font-semibold text-slate-800 dark:text-white">{periodTitle("month", viewDate)}</span>
        <span className="hidden text-slate-300 sm:inline dark:text-white/30">·</span>
        {(Object.keys(BOOKING_PHASE_STYLE) as Array<keyof typeof BOOKING_PHASE_STYLE>).map((phase) => (
          <span key={phase} className="inline-flex items-center gap-1.5">
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", BOOKING_PHASE_STYLE[phase].wash)}>
              {BOOKING_PHASE_STYLE[phase].short}
            </span>
            {BOOKING_PHASE_STYLE[phase].label}
          </span>
        ))}
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", BOOKING_MILESTONE_STYLE.cab.wash)}>
          CAB
        </span>
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", BOOKING_MILESTONE_STYLE.prod.wash)}>
          Prod
        </span>
        <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          Conflict
        </span>
      </div>

      {/* Mobile agenda */}
      <div className="space-y-2 md:hidden">
        {agendaDays.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-[var(--card)] dark:text-white/50">
            No bookings in this month for the current filters.
          </div>
        ) : (
          agendaDays.map((day) => (
            <div
              key={day.dayStr}
              className={cn(
                "rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-600 dark:bg-[var(--card)]",
                day.dayStr === todayStr && "ring-2 ring-brand-400/60"
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                      day.dayStr === todayStr
                        ? "bg-brand-600 text-white"
                        : "bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-white"
                    )}
                  >
                    {day.date.getDate()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">
                      {day.date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-white/45">
                      {day.daySegs.length} phase{day.daySegs.length === 1 ? "" : "s"}
                      {day.dayMs.length > 0
                        ? ` · ${day.dayMs.length} milestone${day.dayMs.length === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onShowDayOnTimeline(day.dayStr)}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                >
                  Timeline
                </button>
              </div>
              {day.dayMs.length > 0 && (
                <div className="mb-2">
                  <DayMilestoneChip milestones={day.dayMs} onSelectBooking={onSelectBooking} />
                </div>
              )}
              <div className="flex flex-col gap-1">
                {day.daySegs.map((seg) => {
                  const style = BOOKING_PHASE_STYLE[seg.phase];
                  return (
                    <button
                      key={seg.id}
                      type="button"
                      onClick={() => onSelectBooking(seg.bookingCode)}
                      title={`${seg.bookingCode} · ${seg.phaseLabel} · ${seg.envCode}${seg.conflict ? " · CONFLICT" : ""}`}
                      className={cn(
                        "flex min-h-[32px] items-center justify-between gap-2 rounded-lg border border-black/5 px-2.5 py-1.5 text-left text-[12px] font-bold shadow-sm dark:border-white/10",
                        style.wash
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-1 truncate">
                        {seg.conflict ? (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-300" aria-hidden />
                        ) : null}
                        <span className="truncate">
                          {seg.bookingCode} · {style.label}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold opacity-80">{seg.envCode}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop month grid */}
      <div className="hidden overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm md:block dark:border-slate-600 dark:bg-[var(--card)]">
        <div className="grid grid-cols-7 border-b-2 border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-900/50">
          {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
            <div
              key={day}
              className="border-r border-slate-300 px-2 py-2.5 text-center text-[10px] font-bold tracking-wider text-slate-600 last:border-r-0 dark:border-slate-600 dark:text-white/55"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {gridDays.map((cell) => {
            const daySegs = segmentsForDay(segments, cell.dayStr);
            const dayMs = milestonesByDay.get(cell.dayStr) ?? [];
            const expanded = expandedDay === cell.dayStr;
            const visible = expanded ? daySegs : daySegs.slice(0, MAX_VISIBLE);
            const hidden = Math.max(0, daySegs.length - MAX_VISIBLE);

            return (
              <div
                key={cell.dayStr}
                className={cn(
                  "relative flex min-h-[140px] flex-col border-b border-r border-slate-300 p-1.5 dark:border-slate-600",
                  cell.isCurrentMonth
                    ? "bg-white dark:bg-[var(--card)]"
                    : "bg-slate-50 dark:bg-slate-900/50",
                  expanded && "z-10 ring-2 ring-inset ring-brand-400"
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      cell.isCurrentMonth ? "text-slate-800 dark:text-white" : "text-slate-400",
                      cell.dayStr === todayStr && "bg-brand-600 text-white"
                    )}
                  >
                    {cell.date.getDate()}
                  </span>
                  <DayMilestoneChip milestones={dayMs} onSelectBooking={onSelectBooking} />
                </div>

                <div className="flex flex-1 flex-col gap-0.5">
                  {visible.map((seg) => {
                    const edge = spanEdge(seg, cell.dayStr);
                    const style = BOOKING_PHASE_STYLE[seg.phase];
                    const label =
                      edge === "start" || edge === "single"
                        ? `${seg.bookingCode} · ${style.short}`
                        : style.short;
                    return (
                      <button
                        key={`${seg.id}-${cell.dayStr}`}
                        type="button"
                        title={`${seg.bookingCode} · ${seg.phaseLabel} · ${seg.envCode}${seg.conflict ? " · CONFLICT" : ""}`}
                        onClick={() => onSelectBooking(seg.bookingCode)}
                        className={cn(
                          "flex min-h-[20px] items-center gap-0.5 truncate border border-black/5 px-1.5 py-0.5 text-left text-[10px] font-bold leading-tight shadow-sm transition hover:brightness-[1.03] dark:border-white/10",
                          style.wash,
                          edge === "single" && "rounded-md",
                          edge === "start" && "rounded-l-md rounded-r-none",
                          edge === "end" && "rounded-r-md rounded-l-none",
                          edge === "middle" && "rounded-none"
                        )}
                      >
                        {seg.conflict && (edge === "start" || edge === "single") ? (
                          <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-rose-600 dark:text-rose-300" aria-hidden />
                        ) : null}
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                  {!expanded && hidden > 0 && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setExpandedDay(cell.dayStr)}
                        className="rounded px-1 py-0.5 text-[10px] font-bold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                      >
                        +{hidden} more
                      </button>
                      <button
                        type="button"
                        onClick={() => onShowDayOnTimeline(cell.dayStr)}
                        className="rounded px-1 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:text-white/50 dark:hover:bg-white/5"
                      >
                        Timeline
                      </button>
                    </div>
                  )}
                  {expanded && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setExpandedDay(null)}
                        className="rounded px-1 text-[10px] font-semibold text-slate-500 hover:text-slate-800 dark:text-white/50"
                      >
                        Collapse
                      </button>
                      <button
                        type="button"
                        onClick={() => onShowDayOnTimeline(cell.dayStr)}
                        className="rounded px-1 text-[10px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
                      >
                        Timeline
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
