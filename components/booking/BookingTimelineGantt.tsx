"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import {
  BOOKING_MILESTONE_STYLE,
  BOOKING_PHASE_STYLE,
  bookingMilestones,
  bookingPhaseSegments,
  milestoneInPeriod,
  segmentInPeriod,
  type BookingMilestone,
  type BookingPhaseSegment,
  type BookingPhaseSource,
} from "@/lib/booking-calendar";
import { useHoverCapable } from "@/hooks/useHoverCapable";
import { periodRange, type Period } from "@/lib/period-range";
import { cn } from "@/lib/utils";

const LABEL_W = 210;
const LABEL_W_NARROW = 120;
const ROW_H = 56;
const AXIS_H = 36;
const BAR_H = 26;
/** Show env code on bar when wider than this (px). */
const ENV_LABEL_MIN_PX = 70;

function dayWidthForPeriod(period: Period): number {
  if (period === "year") return 10;
  if (period === "quarter") return 16;
  return 34;
}

function buildAxisTicks(
  period: Period,
  start: Date,
  end: Date,
  trackWidth: number,
  spanMs: number
): { label: string; left: number }[] {
  const ticks: { label: string; left: number }[] = [];
  const xOf = (d: Date) => ((d.getTime() - start.getTime()) / spanMs) * trackWidth;
  const dayWidth = (24 * 60 * 60 * 1000 * trackWidth) / spanMs;

  if (period === "year") {
    for (let m = 0; m < 12; m++) {
      const d = new Date(start.getFullYear(), m, 1);
      if (d < start || d > end) continue;
      ticks.push({
        label: d.toLocaleString("en-AU", { month: "short" }),
        left: xOf(d),
      });
    }
  } else if (period === "quarter") {
    const cursor = new Date(start);
    while (cursor <= end) {
      ticks.push({
        label: cursor.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
        left: xOf(cursor),
      });
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    const days = end.getDate();
    for (let d = 1; d <= days; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), d);
      ticks.push({ label: String(d), left: xOf(date) + dayWidth / 2 });
    }
  }
  return ticks;
}

function TipBubble({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-left text-[11px] font-medium text-white shadow-lg dark:bg-slate-950">
      {children}
    </div>
  );
}

function PhaseBar({
  seg,
  left,
  width,
  onSelect,
}: {
  seg: BookingPhaseSegment;
  left: number;
  width: number;
  onSelect: (bookingCode: string) => void;
}) {
  const hoverCapable = useHoverCapable();
  const [open, setOpen] = useState(false);
  const style = BOOKING_PHASE_STYLE[seg.phase];
  const showEnv = width > ENV_LABEL_MIN_PX;
  const label = showEnv ? seg.envCode : style.short;

  return (
    <button
      type="button"
      onClick={() => {
        if (!hoverCapable) {
          if (!open) {
            setOpen(true);
            return;
          }
        }
        onSelect(seg.bookingCode);
      }}
      onMouseEnter={() => {
        if (hoverCapable) setOpen(true);
      }}
      onMouseLeave={() => {
        if (hoverCapable) setOpen(false);
      }}
      className="absolute top-1/2 z-[2] flex -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg px-2 text-[11px] font-bold transition-transform duration-150 hover:z-10 hover:scale-105"
      style={{
        left,
        width: Math.max(width, 8),
        height: BAR_H,
        background: style.pastelBg,
        color: style.pastelText,
      }}
      aria-label={`${seg.phaseLabel} · ${seg.envCode}`}
    >
      <span className="truncate">{label}</span>
      <TipBubble open={open}>
        <div className="font-bold">{seg.envCode}</div>
        <div className="capitalize text-white/70">
          {seg.phaseLabel} · {seg.startIso} → {seg.endIso}
        </div>
      </TipBubble>
    </button>
  );
}

function MilestoneDot({
  m,
  left,
  onSelect,
}: {
  m: BookingMilestone;
  left: number;
  onSelect: (bookingCode: string) => void;
}) {
  const hoverCapable = useHoverCapable();
  const [open, setOpen] = useState(false);
  const style = BOOKING_MILESTONE_STYLE[m.kind];

  return (
    <button
      type="button"
      onClick={() => {
        if (!hoverCapable) {
          if (!open) {
            setOpen(true);
            return;
          }
        }
        onSelect(m.bookingCode);
      }}
      onMouseEnter={() => {
        if (hoverCapable) setOpen(true);
      }}
      onMouseLeave={() => {
        if (hoverCapable) setOpen(false);
      }}
      className="absolute top-1/2 z-[3] flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full ring-2 ring-white transition-transform hover:scale-125 dark:ring-[var(--card)]"
      style={{ left, background: style.solid }}
      aria-label={`${m.label} · ${m.dateIso}`}
    >
      <TipBubble open={open}>
        <span className="font-bold capitalize">
          {m.label} · {m.dateIso}
        </span>
      </TipBubble>
    </button>
  );
}

function TimelineLegend({ focusDayIso }: { focusDayIso?: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[12px] font-semibold text-slate-500 dark:text-white/60">
      {(Object.keys(BOOKING_PHASE_STYLE) as Array<keyof typeof BOOKING_PHASE_STYLE>).map((phase) => (
        <span key={phase} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: BOOKING_PHASE_STYLE[phase].solid }}
          />
          {BOOKING_PHASE_STYLE[phase].label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: BOOKING_MILESTONE_STYLE.cab.solid }} />
        CAB
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: BOOKING_MILESTONE_STYLE.prod.solid }} />
        Prod
      </span>
      <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-300">
        <AlertTriangle size={13} aria-hidden /> Conflict
      </span>
      {focusDayIso && (
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          Focused on {focusDayIso}
        </span>
      )}
    </div>
  );
}

export function BookingTimelineGantt({
  bookings,
  viewDate,
  period,
  focusDayIso,
  onSelectBooking,
}: {
  bookings: BookingPhaseSource[];
  viewDate: Date;
  period: Period;
  focusDayIso?: string | null;
  onSelectBooking: (bookingCode: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { start: periodStart, end: periodEnd } = useMemo(
    () => periodRange(period, viewDate),
    [period, viewDate]
  );

  const spanMs = Math.max(1, periodEnd.getTime() - periodStart.getTime());
  const dayCount = Math.max(1, Math.round(spanMs / (24 * 60 * 60 * 1000)) + 1);
  const dayWidth = dayWidthForPeriod(period);
  const trackWidth = Math.max(dayCount * dayWidth, period === "year" ? 900 : period === "quarter" ? 700 : 34 * 28);

  const xOf = (d: Date) => {
    const t = Math.min(periodEnd.getTime(), Math.max(periodStart.getTime(), d.getTime()));
    return ((t - periodStart.getTime()) / spanMs) * trackWidth;
  };

  const rows = useMemo(() => {
    let segs = bookingPhaseSegments(bookings).filter((s) => segmentInPeriod(s, period, viewDate));
    let miles = bookingMilestones(bookings).filter((m) => milestoneInPeriod(m, period, viewDate));

    if (focusDayIso) {
      const day = new Date(`${focusDayIso}T12:00:00`);
      segs = segs.filter((s) => s.start <= day && s.end >= day);
      miles = miles.filter((m) => m.dateIso === focusDayIso);
    }

    const byBooking = new Map<
      string,
      {
        bookingId: string;
        bookingCode: string;
        applicationName: string;
        conflict: boolean;
        segments: typeof segs;
        milestones: typeof miles;
      }
    >();

    for (const s of segs) {
      if (!byBooking.has(s.bookingId)) {
        byBooking.set(s.bookingId, {
          bookingId: s.bookingId,
          bookingCode: s.bookingCode,
          applicationName: s.applicationName,
          conflict: s.conflict,
          segments: [],
          milestones: [],
        });
      }
      const row = byBooking.get(s.bookingId)!;
      row.segments.push(s);
      if (s.conflict) row.conflict = true;
    }
    for (const m of miles) {
      if (!byBooking.has(m.bookingId)) {
        byBooking.set(m.bookingId, {
          bookingId: m.bookingId,
          bookingCode: m.bookingCode,
          applicationName: "",
          conflict: m.conflict,
          segments: [],
          milestones: [],
        });
      }
      const row = byBooking.get(m.bookingId)!;
      row.milestones.push(m);
      if (m.conflict) row.conflict = true;
      if (!row.applicationName) {
        const match = bookings.find((b) => b.id === m.bookingId);
        row.applicationName = match?.application?.name ?? "";
      }
    }

    return [...byBooking.values()].sort((a, b) => a.bookingCode.localeCompare(b.bookingCode));
  }, [bookings, period, viewDate, focusDayIso]);

  const ticks = useMemo(
    () => buildAxisTicks(period, periodStart, periodEnd, trackWidth, spanMs),
    [period, periodStart, periodEnd, trackWidth, spanMs]
  );

  const dateColumns = useMemo(() => {
    const columns: {
      key: string;
      left: number;
      width: number;
      major: boolean;
      weekend: boolean;
    }[] = [];
    const cursor = new Date(periodStart);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= periodEnd) {
      const next = new Date(cursor);
      next.setDate(next.getDate() + 1);
      const left = xOf(cursor);
      const right = xOf(next);
      const day = cursor.getDay();
      columns.push({
        key: cursor.toISOString(),
        left,
        width: Math.max(1, right - left),
        major:
          period === "month"
            ? cursor.getDate() === 1 || day === 1
            : period === "quarter"
              ? cursor.getDate() === 1 || day === 1
              : cursor.getDate() === 1,
        weekend: day === 0 || day === 6,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return columns;
  }, [period, periodStart, periodEnd, spanMs, trackWidth]);

  const focusLineLeft = useMemo(() => {
    if (!focusDayIso) return null;
    const d = new Date(`${focusDayIso}T12:00:00`);
    if (d < periodStart || d > periodEnd) return null;
    return xOf(d);
  }, [focusDayIso, periodStart, periodEnd, spanMs, trackWidth]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-[var(--card)] dark:text-white/50">
        {focusDayIso
          ? `No booking phases overlap ${focusDayIso} in this period.`
          : "No booking phases overlap this period."}
      </div>
    );
  }

  return (
    <div
      className="rounded-[24px] bg-white p-5 shadow-[0_18px_40px_-24px_rgba(112,144,176,0.18)] dark:bg-[var(--card)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)] sm:p-7"
      style={{ fontFamily: "'Plus Jakarta Sans','DM Sans',ui-sans-serif,system-ui,sans-serif" }}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <TimelineLegend focusDayIso={focusDayIso} />
        <span className="text-[12px] font-medium text-slate-400 dark:text-white/45">
          {rows.length} booking{rows.length === 1 ? "" : "s"} · scroll horizontally · click a bar for
          Table
        </span>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 [scrollbar-width:thin]"
      >
        <div style={{ minWidth: LABEL_W_NARROW + trackWidth }}>
          <div
            className="sticky top-0 z-20 flex border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/80"
            style={{ height: AXIS_H }}
          >
            <div className="sticky left-0 z-30 flex w-[120px] shrink-0 items-center bg-slate-50/95 px-3 text-[11px] font-bold uppercase tracking-wide text-slate-400 backdrop-blur-sm dark:bg-slate-900/95 dark:text-white/45 md:w-[210px] md:px-4">
              Booking
            </div>
            <div className="relative shrink-0" style={{ width: trackWidth, height: AXIS_H }}>
              {dateColumns.map((column) => (
                <span
                  key={column.key}
                  className={cn(
                    "pointer-events-none absolute inset-y-0 border-l",
                    column.major
                      ? "border-slate-300 dark:border-slate-600"
                      : "border-slate-200/80 dark:border-slate-700/70",
                    column.weekend && "bg-slate-100/70 dark:bg-slate-800/45"
                  )}
                  style={{ left: column.left, width: column.width }}
                  aria-hidden
                />
              ))}
              {ticks.map((t) => (
                <span
                  key={`${t.label}-${t.left}`}
                  className="absolute top-2.5 z-10 -translate-x-1/2 text-[10.5px] font-bold text-slate-500 dark:text-white/55"
                  style={{ left: t.left }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          {rows.map((row) => (
            <div
              key={row.bookingId}
              className="group/row flex items-center border-b border-slate-200 last:border-0 hover:bg-brand-50/25 dark:border-slate-700 dark:hover:bg-white/[0.03]"
              style={{ minHeight: ROW_H }}
            >
              <button
                type="button"
                onClick={() => onSelectBooking(row.bookingCode)}
                className="sticky left-0 z-10 flex w-[120px] shrink-0 flex-col justify-center border-r border-slate-200 bg-white px-3 py-4 text-left group-hover/row:bg-brand-50/60 dark:border-slate-700 dark:bg-[var(--card)] dark:group-hover/row:bg-slate-800 md:w-[210px] md:px-4"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[12px] font-bold text-brand-600 dark:text-brand-400 md:text-[12.5px]">
                    {row.bookingCode}
                  </span>
                  {row.conflict && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                      <AlertTriangle size={10} aria-hidden /> Conflict
                    </span>
                  )}
                </div>
                <div className="truncate text-[11px] text-slate-400 dark:text-white/45 md:text-[11.5px]">
                  {row.applicationName || "—"}
                </div>
              </button>

              <div className="relative shrink-0" style={{ width: trackWidth, height: ROW_H }}>
                {dateColumns.map((column) => (
                  <span
                    key={column.key}
                    className={cn(
                      "pointer-events-none absolute inset-y-0 border-l",
                      column.major
                        ? "border-slate-300 dark:border-slate-600"
                        : "border-slate-200/80 dark:border-slate-700/70",
                      column.weekend && "bg-slate-50/80 dark:bg-slate-800/25"
                    )}
                    style={{ left: column.left, width: column.width }}
                    aria-hidden
                  />
                ))}
                {focusLineLeft != null && (
                  <div
                    className="pointer-events-none absolute inset-y-1 z-[5] w-0.5 bg-brand-500/70"
                    style={{ left: focusLineLeft }}
                  />
                )}

                {row.segments.map((seg) => {
                  const left = xOf(seg.start);
                  const right = xOf(seg.end);
                  const width = Math.max(8, right - left);
                  return (
                    <PhaseBar
                      key={seg.id}
                      seg={seg}
                      left={left}
                      width={width}
                      onSelect={onSelectBooking}
                    />
                  );
                })}

                {row.milestones.map((m) => (
                  <MilestoneDot key={m.id} m={m} left={xOf(m.date)} onSelect={onSelectBooking} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-white/45">
        <Info size={12} aria-hidden />
        Hover or tap any bar or dot for exact dates. Conflict badge shows once per booking, not per
        segment.
      </div>
    </div>
  );
}
