"use client";

import { useMemo } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { cn } from "@/lib/utils";

function localDayStr(d: Date): string {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split("T")[0];
}

function eventTone(eventType: string): {
  colorClass: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
} {
  if (eventType === "RELEASE") {
    return {
      colorClass: "bg-brand-500",
      bgClass: "bg-gray-50/80",
      borderClass: "border-gray-100",
      textClass: "text-gray-700",
    };
  }
  if (eventType === "CAB MEETING") {
    return {
      colorClass: "bg-amber-500",
      bgClass: "bg-gray-50/80",
      borderClass: "border-gray-100",
      textClass: "text-gray-700",
    };
  }
  if (eventType === "CHANGE FREEZE") {
    return {
      colorClass: "bg-error-500",
      bgClass: "bg-error-50/80",
      borderClass: "border-error-200",
      textClass: "text-error-800",
    };
  }
  if (eventType === "REGULATORY") {
    return {
      colorClass: "bg-purple-500",
      bgClass: "bg-gray-50/80",
      borderClass: "border-gray-100",
      textClass: "text-gray-700",
    };
  }
  if (eventType === "VENDOR MAINT") {
    return {
      colorClass: "bg-blue-500",
      bgClass: "bg-gray-50/80",
      borderClass: "border-gray-100",
      textClass: "text-gray-700",
    };
  }
  return {
    colorClass: "bg-gray-400",
    bgClass: "bg-gray-50/80",
    borderClass: "border-gray-100",
    textClass: "text-gray-700",
  };
}

export function MonthGridCalendar({
  events,
  viewDate,
  onShowDayOnTimeline,
}: {
  events: any[];
  viewDate: Date;
  onShowDayOnTimeline?: (dayIso: string) => void;
}) {
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
      return { date: d, isCurrentMonth: false, dayStr: localDayStr(d) };
    });

    const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return { date: d, isCurrentMonth: true, dayStr: localDayStr(d) };
    });

    const blankAfter = Array.from({ length: paddingAfter }, (_, i) => {
      const d = new Date(year, month + 1, i + 1);
      return { date: d, isCurrentMonth: false, dayStr: localDayStr(d) };
    });

    return {
      gridDays: [...blankBefore, ...monthDays, ...blankAfter],
    };
  }, [viewDate]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    events.forEach((r) => {
      const d = new Date(r.date);
      const localISOTime = localDayStr(d);
      if (!map.has(localISOTime)) map.set(localISOTime, []);
      map.get(localISOTime)!.push(r);
    });
    return map;
  }, [events]);

  const todayStr = useMemo(() => localDayStr(new Date()), []);

  const agendaDays = useMemo(() => {
    return gridDays
      .filter((cell) => cell.isCurrentMonth)
      .map((cell) => ({
        ...cell,
        dayEvents: eventsByDate.get(cell.dayStr) || [],
      }))
      .filter((d) => d.dayEvents.length > 0);
  }, [gridDays, eventsByDate]);

  return (
    <div className="space-y-3">
      {/* Mobile agenda */}
      <div className="space-y-2 md:hidden">
        {agendaDays.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500 dark:border-slate-600 dark:bg-[var(--card)] dark:text-white/50">
            No events in this month for the current filters.
          </div>
        ) : (
          agendaDays.map((day) => (
            <div
              key={day.dayStr}
              className={cn(
                "rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-slate-600 dark:bg-[var(--card)]",
                day.dayStr === todayStr && "ring-2 ring-brand-400/60"
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold",
                      day.dayStr === todayStr
                        ? "bg-brand-500 text-white"
                        : "bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-white"
                    )}
                  >
                    {day.date.getDate()}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {day.date.toLocaleDateString("en-AU", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-white/45">
                      {day.dayEvents.length} event{day.dayEvents.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                {onShowDayOnTimeline && (
                  <button
                    type="button"
                    onClick={() => onShowDayOnTimeline(day.dayStr)}
                    className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                  >
                    Timeline
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {day.dayEvents.map((r) => {
                  const tone = eventTone(r.eventType);
                  const body = (
                    <>
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", tone.colorClass)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold">{r.title}</p>
                        <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">
                          {r.eventType}
                        </p>
                      </div>
                    </>
                  );
                  if (r.releaseId) {
                    return (
                      <ProgressLink
                        key={r.id}
                        href={`/releases/${r.releaseId}`}
                        className={cn(
                          "flex items-start gap-2 rounded-lg border px-2.5 py-2 no-underline",
                          tone.bgClass,
                          tone.borderClass,
                          tone.textClass
                        )}
                      >
                        {body}
                      </ProgressLink>
                    );
                  }
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        "flex items-start gap-2 rounded-lg border px-2.5 py-2",
                        tone.bgClass,
                        tone.borderClass,
                        tone.textClass
                      )}
                    >
                      {body}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop month grid */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-sm md:block dark:border-slate-600">
        <div className="grid grid-cols-7 border-b border-gray-200 bg-white dark:border-slate-600 dark:bg-[var(--card)]">
          {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
            <div
              key={day}
              className="border-r border-gray-100 px-2 py-3 text-center text-[10px] font-bold tracking-wider text-gray-500 last:border-r-0 dark:border-slate-700 dark:text-white/55"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px border-b border-gray-200 bg-gray-100 dark:border-slate-600 dark:bg-slate-800">
          {gridDays.map((cell, idx) => {
            const dayEvents = eventsByDate.get(cell.dayStr) || [];

            return (
              <div
                key={idx}
                className={cn(
                  "relative flex min-h-[140px] flex-col bg-white p-2 transition-colors hover:bg-gray-50/50 dark:bg-[var(--card)] dark:hover:bg-white/[0.03]",
                  !cell.isCurrentMonth && "bg-gray-50/30 dark:bg-slate-900/40"
                )}
              >
                <div className="relative z-10 flex justify-start">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                      cell.isCurrentMonth ? "text-gray-900 dark:text-white" : "text-gray-400",
                      cell.dayStr === todayStr && "bg-brand-500 text-white"
                    )}
                  >
                    {cell.date.getDate()}
                  </span>
                </div>

                <div className="relative z-10 mt-1 flex-1 space-y-1">
                  {dayEvents.map((r) => {
                    const tone = eventTone(r.eventType);
                    const isLink = !!r.releaseId;

                    const chip = (
                      <span
                        className={cn(
                          "block truncate rounded border px-1.5 py-1 text-[10px] font-medium transition-colors",
                          tone.bgClass,
                          tone.borderClass,
                          tone.textClass,
                          !cell.isCurrentMonth && "opacity-70",
                          isLink && "cursor-pointer hover:border-gray-300 hover:bg-white dark:hover:bg-white/5"
                        )}
                        title={r.title}
                      >
                        <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full", tone.colorClass)} />
                        {r.title}
                      </span>
                    );

                    if (isLink) {
                      return (
                        <ProgressLink key={r.id} href={`/releases/${r.releaseId}`} className="block no-underline">
                          {chip}
                        </ProgressLink>
                      );
                    }
                    return <div key={r.id}>{chip}</div>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
