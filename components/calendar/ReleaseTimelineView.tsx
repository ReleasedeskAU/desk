"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Minus,
  Plus,
  StickyNote,
  X,
} from "lucide-react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { CalendarStatusLegend } from "@/components/calendar/CalendarStatusLegend";
import { useHoverCapable } from "@/hooks/useHoverCapable";
import {
  buildMonthAxisLabels,
  buildPeriodSegments,
  dateToX,
  fitYearTrackWidth,
  formatTodayMarkerLabel,
  layoutDotTimelineMarkers,
  layoutTimelineMilestones,
  TIMELINE_AXIS_PERCENT,
  TIMELINE_TONES,
  TIMELINE_TRACK_HEIGHT,
  YEAR_DOT_TRACK_HEIGHT,
  timelineRangeLabel,
  timelineTrackWidth,
  yearTimelineTrackWidth,
  type TimelineMarker,
  type TimelineMilestone,
  type TimelinePeriodSegment,
} from "@/lib/release-timeline";
import type { UnifiedRelease } from "@/lib/unified-releases";
import type { Period } from "@/lib/period-range";
import { cn } from "@/lib/utils";

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
const STEM_HEIGHT_DEFAULT = 56;

function ConnectorDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "z-20 h-3 w-3 shrink-0 rounded-full border-2 border-slate-300 bg-white ring-4 ring-slate-100 dark:border-slate-500 dark:bg-slate-800 dark:ring-slate-700",
        className,
      )}
    />
  );
}

function ConnectorLine() {
  return <span className="block h-16 w-px shrink-0 bg-slate-300 dark:bg-slate-500" />;
}

function MilestoneCard({ milestone }: { milestone: TimelineMilestone }) {
  const t = TIMELINE_TONES[milestone.tone];
  const Icon = milestone.icon;
  const isUp = milestone.side === "up";

  const card = (
    <ProgressLink
      href={milestone.href}
      title={`${milestone.code} · ${milestone.name} · ${milestone.status} · ${milestone.dateLabel}`}
      className="group relative block w-[200px] rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-[0_14px_30px_-18px_rgba(112,144,176,0.4)]
        transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-16px_rgba(112,144,176,0.55)]
        dark:border-slate-700 dark:bg-[var(--card)]"
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.chip} text-white shadow-sm`}>
        <Icon size={16} />
      </span>
      <div className="mt-2.5 text-[13px] font-bold leading-snug text-slate-800 dark:text-white">{milestone.code}</div>
      <div className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-slate-500 dark:text-white/60">{milestone.name}</div>
      <div className="mt-2">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${t.pill}`}>{milestone.status}</span>
      </div>
      <div className="mt-2 text-right text-lg font-bold tracking-tight text-slate-700 dark:text-white/90">
        {milestone.dateLabel}
      </div>
      {milestone.note && (
        <div className="absolute -right-2 -top-2 max-w-[130px] rotate-6 rounded-md bg-amber-200 px-2 py-1 text-[9px] font-bold leading-tight text-amber-800 shadow-sm dark:bg-amber-400/90">
          <StickyNote size={9} className="mb-0.5 inline" /> {milestone.note}
        </div>
      )}
    </ProgressLink>
  );

  return (
    <div
      className="absolute z-10"
      style={{
        left: milestone._x,
        top: `${TIMELINE_AXIS_PERCENT}%`,
        transform: "translateX(-50%)",
      }}
    >
      {isUp ? (
        <div className="flex flex-col items-center" style={{ transform: "translateY(-100%)" }}>
          {card}
          <ConnectorLine />
          <ConnectorDot className="translate-y-1/2" />
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <ConnectorDot className="-translate-y-1/2" />
          <ConnectorLine />
          {card}
        </div>
      )}
    </div>
  );
}

function HoverTip({
  isUp,
  open,
  children,
}: {
  isUp: boolean;
  open: boolean;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <span
      className={cn(
        "pointer-events-none absolute left-1/2 z-40 w-56 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-left text-[11px] leading-snug text-white shadow-xl dark:bg-slate-950",
        isUp ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]",
      )}
    >
      {children}
    </span>
  );
}

/** ProgressLink that shows tip on hover (desktop) or first-tap (touch); second tap navigates. */
function TipMarkerLink({
  href,
  title,
  isUp,
  tip,
  className,
  children,
}: {
  href: string;
  title: string;
  isUp: boolean;
  tip: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const hoverCapable = useHoverCapable();
  const [open, setOpen] = useState(false);

  return (
    <ProgressLink
      href={href}
      title={title}
      className={cn("relative no-underline", className)}
      onMouseEnter={() => {
        if (hoverCapable) setOpen(true);
      }}
      onMouseLeave={() => {
        if (hoverCapable) setOpen(false);
      }}
      onClick={(e) => {
        if (!hoverCapable && !open) {
          e.preventDefault();
          setOpen(true);
        }
      }}
    >
      {children}
      <HoverTip isUp={isUp} open={open}>
        {tip}
      </HoverTip>
    </ProgressLink>
  );
}

/**
 * Balloon marker: round colored head at the end of a thin stem, anchored on the track.
 * Label sits beside the head as plain text (no card box).
 */
function DotStemMarker({ marker }: { marker: TimelineMarker }) {
  const isUp = marker.side === "up";
  const tone = marker.kind === "single" ? marker.milestone.tone : marker.tone;
  const solid = TIMELINE_TONES[tone].solid;
  const stemHeight = marker.stemHeight ?? STEM_HEIGHT_DEFAULT;

  const stem = (
    <span
      className="block w-px shrink-0 bg-slate-400 dark:bg-slate-500"
      style={{ height: stemHeight }}
      aria-hidden
    />
  );

  /** Small anchor where the stem meets the timeline. */
  const trackAnchor = (
    <span
      className="z-20 h-2 w-2 shrink-0 rounded-full ring-2 ring-white dark:ring-[var(--card)]"
      style={{ backgroundColor: solid }}
      aria-hidden
    />
  );

  /** Round balloon head — solid status color (never white/black). */
  const balloonHead = (content?: ReactNode) => (
    <span
      className="relative z-20 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-md ring-2 ring-white/90 dark:ring-[var(--card)]"
      style={{ backgroundColor: solid }}
      aria-hidden={!content}
    >
      {content}
    </span>
  );

  if (marker.kind === "single") {
    const m = marker.milestone;
    const body = (
      <TipMarkerLink
        href={m.href}
        title={`${m.code} · ${m.name} · ${m.status} · ${m.dateLabel}`}
        isUp={isUp}
        className="group flex max-w-[112px] flex-col items-center"
        tip={
          <>
            <span className="block font-bold">{m.code}</span>
            <span className="mt-0.5 block text-white/85">{m.name}</span>
            <span className="mt-1 block text-white/60">
              {m.status} · {m.dateLabel}
            </span>
          </>
        }
      >
        {balloonHead()}
        <span className="mt-1.5 block w-full truncate text-center text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-200">
          {m.code}
        </span>
        <span className="mt-0.5 block w-full truncate text-center text-[10px] leading-tight text-slate-500 dark:text-slate-400">
          {m.dateLabel}
        </span>
      </TipMarkerLink>
    );

    return (
      <div
        className="absolute z-10"
        style={{
          left: marker._x,
          top: `${TIMELINE_AXIS_PERCENT}%`,
          transform: "translateX(-50%)",
        }}
      >
        {isUp ? (
          <div className="flex flex-col items-center" style={{ transform: "translateY(-100%)" }}>
            {body}
            <div className="mt-0.5 flex flex-col items-center">
              {stem}
              <span className="-mt-1">{trackAnchor}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="flex flex-col items-center">
              <span className="-mb-1">{trackAnchor}</span>
              {stem}
            </div>
            <div className="mt-0.5">{body}</div>
          </div>
        )}
      </div>
    );
  }

  const primary = marker.members[0];
  const body = (
    <TipMarkerLink
      href={primary.href}
      title={marker.members.map((m) => `${m.code} (${m.dateLabel})`).join(" · ")}
      isUp={isUp}
      className="group flex max-w-[120px] flex-col items-center"
      tip={
        <>
          <span className="mb-1 block font-bold">{marker.count} releases in this window</span>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {marker.members.map((m) => (
              <li key={m.id} className="text-white/85">
                <span className="font-semibold text-white">{m.code}</span>
                <span className="text-white/55">
                  {" "}
                  · {m.dateLabel} · {m.status}
                </span>
              </li>
            ))}
          </ul>
        </>
      }
    >
      {balloonHead(marker.count)}
      <span className="mt-1.5 block w-full truncate text-center text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-200">
        {marker.count} releases
      </span>
      <span className="mt-0.5 block w-full truncate text-center text-[10px] leading-tight text-slate-500 dark:text-slate-400">
        {marker.dateLabel}
      </span>
    </TipMarkerLink>
  );

  return (
    <div
      className="absolute z-10"
      style={{
        left: marker._x,
        top: `${TIMELINE_AXIS_PERCENT}%`,
        transform: "translateX(-50%)",
      }}
    >
      {isUp ? (
        <div className="flex flex-col items-center" style={{ transform: "translateY(-100%)" }}>
          {body}
          <div className="mt-0.5 flex flex-col items-center">
            {stem}
            <span className="-mt-1">{trackAnchor}</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="flex flex-col items-center">
            <span className="-mb-1">{trackAnchor}</span>
            {stem}
          </div>
          <div className="mt-0.5">{body}</div>
        </div>
      )}
    </div>
  );
}

function TodayMarker({
  x,
  visible,
  label,
}: {
  x: number;
  visible: boolean;
  label: string;
}) {
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none absolute z-[6]"
      style={{ left: x, top: `${TIMELINE_AXIS_PERCENT}%`, transform: "translate(-50%, -50%)" }}
    >
      <div className="flex flex-col items-center">
        <span className="mb-1 whitespace-nowrap rounded-sm bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm dark:bg-brand-500">
          {label}
        </span>
        <span className="h-3 w-3 rounded-sm bg-brand-500 ring-2 ring-white dark:bg-brand-500 dark:ring-[var(--card)]" />
      </div>
    </div>
  );
}

function TimelineTrack({
  milestones,
  markers,
  periods,
  useDots,
  trackWidth,
  trackHeight = TIMELINE_TRACK_HEIGHT,
  monthLabels,
  todayX,
  showToday,
  todayLabel,
}: {
  milestones?: TimelineMilestone[];
  markers?: TimelineMarker[];
  periods: TimelinePeriodSegment[];
  useDots: boolean;
  trackWidth: number;
  trackHeight?: number;
  monthLabels?: { label: string; x: number }[];
  todayX?: number;
  showToday?: boolean;
  todayLabel?: string;
}) {
  return (
    <div className="relative overflow-visible" style={{ width: trackWidth, height: trackHeight }}>
      {/* Full-width track line — use explicit width so it spans the entire scrollable track */}
      <div
        className="absolute z-0 h-[2px] -translate-y-1/2 bg-slate-500 dark:bg-slate-400"
        style={{
          top: `${TIMELINE_AXIS_PERCENT}%`,
          left: 16,
          width: Math.max(trackWidth - 32, 0),
        }}
      />

      {/* Month / quarter segment pills only for card (non-year) view */}
      {!useDots && (
        <div
          className="absolute left-0 right-0 z-[1] -translate-y-1/2"
          style={{ top: `${TIMELINE_AXIS_PERCENT}%` }}
        >
          {periods.map((p, i) => (
            <div
              key={`${p.period}-${i}`}
              className={`absolute h-3 rounded-full bg-gradient-to-r ${TIMELINE_TONES[p.tone].track} opacity-95 shadow-sm`}
              style={{ left: p.x1 - 50, width: Math.max(p.x2 - p.x1 + 100, 80) }}
            />
          ))}
        </div>
      )}

      {monthLabels
        ? monthLabels.map((m) => (
            <span
              key={m.label + m.x}
              className="absolute z-[2] text-[10px] font-medium text-slate-400 dark:text-slate-500"
              style={{
                left: m.x,
                bottom: 14,
                transform: "translateX(-50%)",
              }}
            >
              {m.label}
            </span>
          ))
        : !useDots
          ? periods.map((p, i) => (
              <span
                key={`label-${p.period}-${i}`}
                className="absolute z-[2] rounded-full bg-slate-800 px-3 py-1 text-[10px] font-bold text-white shadow-sm dark:bg-slate-700"
                style={{
                  left: (p.x1 + p.x2) / 2,
                  top: `${TIMELINE_AXIS_PERCENT}%`,
                  transform: "translate(-50%, calc(-50% - 2.75rem))",
                }}
              >
                {p.period}
              </span>
            ))
          : null}

      {typeof todayX === "number" && (
        <TodayMarker x={todayX} visible={!!showToday} label={todayLabel ?? formatTodayMarkerLabel()} />
      )}

      {useDots && markers
        ? markers.map((m) => <DotStemMarker key={m.id} marker={m} />)
        : (milestones ?? []).map((m) => <MilestoneCard key={m.id} milestone={m} />)}
    </div>
  );
}

function useScrollNav(depsKey: string | number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScrollState, depsKey]);

  const scrollByPage = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.85, 320), behavior: "smooth" });
  };

  return { scrollRef, canScrollLeft, canScrollRight, updateScrollState, scrollByPage };
}

function TimelineExpandModal({
  open,
  onClose,
  releases,
  periodStart,
  periodEnd,
}: {
  open: boolean;
  onClose: () => void;
  releases: UnifiedRelease[];
  periodStart: Date;
  periodEnd: Date;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const { scrollRef, canScrollLeft, canScrollRight, updateScrollState, scrollByPage } = useScrollNav(
    open ? "open" : "closed",
  );
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startX: number; startScroll: number } | null>(null);

  const baseWidth = useMemo(
    () => fitYearTrackWidth(viewportWidth, releases.length),
    [viewportWidth, releases.length],
  );
  const trackWidth = Math.round(baseWidth * zoom);

  const markers = useMemo(
    () => layoutDotTimelineMarkers(releases, periodStart, periodEnd, trackWidth),
    [releases, periodStart, periodEnd, trackWidth],
  );
  const flatForSegments = useMemo(
    () =>
      markers.flatMap((m) =>
        m.kind === "single" ? [m.milestone] : m.members.map((mem) => ({ ...mem, _x: m._x, side: m.side })),
      ),
    [markers],
  );
  const periods = useMemo(() => buildPeriodSegments(flatForSegments), [flatForSegments]);
  const monthLabels = useMemo(
    () => buildMonthAxisLabels(periodStart, periodEnd, trackWidth),
    [periodStart, periodEnd, trackWidth],
  );

  const today = new Date();
  const showToday = today >= periodStart && today <= periodEnd;
  const todayX = showToday ? dateToX(today, periodStart, periodEnd, trackWidth, 56) : 0;
  const todayLabel = formatTodayMarkerLabel(today);

  const needsNav = zoom > ZOOM_MIN + 0.01 || canScrollLeft || canScrollRight;

  useEffect(() => {
    if (!open) return;
    setZoom(ZOOM_MIN);
    let ro: ResizeObserver | null = null;
    const measure = () => {
      const el = viewportRef.current;
      if (el) setViewportWidth(el.clientWidth);
    };
    const raf = requestAnimationFrame(() => {
      measure();
      if (viewportRef.current) {
        ro = new ResizeObserver(measure);
        ro.observe(viewportRef.current);
      }
    });
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (el && zoom === ZOOM_MIN) el.scrollLeft = 0;
  }, [zoom, trackWidth, updateScrollState, scrollRef]);

  const setZoomClamped = (next: number) => {
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100)));
  };

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => {
          const next = z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
          return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100));
        });
      }
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [open, scrollRef]);

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    const el = scrollRef.current;
    if (!el) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
      el.scrollLeft += e.shiftKey ? e.deltaY : e.deltaX;
    } else if (el.scrollWidth > el.clientWidth + 4) {
      el.scrollLeft += e.deltaY;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 4) return;
    if ((e.target as HTMLElement).closest("a")) return;
    dragState.current = { startX: e.clientX, startScroll: el.scrollLeft };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current || !scrollRef.current) return;
    const dx = e.clientX - dragState.current.startX;
    scrollRef.current.scrollLeft = dragState.current.startScroll - dx;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragState.current = null;
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;

  const yearLabel = timelineRangeLabel(periodStart, periodEnd);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Expanded release timeline"
      onClick={onClose}
    >
      <div
        className="flex h-[min(94vh,920px)] w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-[var(--border)] dark:bg-[var(--card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-[var(--border)] sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Year Timeline</h2>
            <p className="text-xs text-gray-500 dark:text-white/55">
              {yearLabel} · {releases.length} release{releases.length === 1 ? "" : "s"} · fit to year at 100%
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CalendarStatusLegend />
            <div className="flex items-center gap-1 rounded-xl bg-slate-50 p-1 dark:bg-slate-900/60 dark:ring-1 dark:ring-slate-700">
              <button
                type="button"
                onClick={() => setZoomClamped(zoom - ZOOM_STEP)}
                disabled={zoom <= ZOOM_MIN}
                aria-label="Zoom out"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white disabled:opacity-30 dark:text-white/80 dark:hover:bg-white/5"
              >
                <Minus size={15} />
              </button>
              <span className="min-w-[3.25rem] text-center text-xs font-bold tabular-nums text-slate-700 dark:text-white/80">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomClamped(zoom + ZOOM_STEP)}
                disabled={zoom >= ZOOM_MAX}
                aria-label="Zoom in"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white disabled:opacity-30 dark:text-white/80 dark:hover:bg-white/5"
              >
                <Plus size={15} />
              </button>
              <button
                type="button"
                onClick={() => setZoomClamped(ZOOM_MIN)}
                className="ml-0.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-white dark:text-white/60 dark:hover:bg-white/5"
              >
                Fit year
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close expanded timeline"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div ref={viewportRef} className="relative min-h-0 flex-1 bg-slate-50/40 dark:bg-transparent">
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            disabled={!needsNav || !canScrollLeft}
            aria-label="Scroll timeline left"
            className={cn(
              "absolute left-2 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-opacity dark:border-slate-600 dark:bg-slate-800 dark:text-white/80",
              needsNav && canScrollLeft
                ? "opacity-100 hover:bg-slate-50 dark:hover:bg-slate-700"
                : "pointer-events-none opacity-30",
            )}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            disabled={!needsNav || !canScrollRight}
            aria-label="Scroll timeline right"
            className={cn(
              "absolute right-2 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-opacity dark:border-slate-600 dark:bg-slate-800 dark:text-white/80",
              needsNav && canScrollRight
                ? "opacity-100 hover:bg-slate-50 dark:hover:bg-slate-700"
                : "pointer-events-none opacity-30",
            )}
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div
            ref={scrollRef}
            onScroll={updateScrollState}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={cn(
              "h-full overflow-x-auto overflow-y-hidden px-12 py-4 [scrollbar-width:thin]",
              dragging ? "cursor-grabbing select-none" : needsNav ? "cursor-grab" : "cursor-default",
            )}
          >
            <div className="flex h-full min-h-[420px] items-center">
              <TimelineTrack
                markers={markers}
                periods={periods}
                useDots
                trackWidth={trackWidth}
                trackHeight={YEAR_DOT_TRACK_HEIGHT}
                monthLabels={monthLabels}
                todayX={todayX}
                showToday={showToday}
                todayLabel={todayLabel}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 px-4 py-2.5 text-[11px] text-slate-400 dark:border-[var(--border)] dark:text-white/45 sm:px-5">
          Scroll or drag to pan when zoomed in · Ctrl/⌘ + scroll to zoom · Esc to close
        </div>
      </div>
    </div>
  );
}

export function ReleaseTimelineView({
  releases,
  periodStart,
  periodEnd,
  period = "month",
}: {
  releases: UnifiedRelease[];
  periodStart: Date;
  periodEnd: Date;
  /** When `year`, use minimal dot + stem markers instead of rectangular cards. */
  period?: Period;
}) {
  const { scrollRef, canScrollLeft, canScrollRight, updateScrollState, scrollByPage } = useScrollNav(
    `${period}-${releases.length}`,
  );
  const [expanded, setExpanded] = useState(false);
  const useDots = period === "year";
  const trackWidth = useDots ? yearTimelineTrackWidth(releases.length) : timelineTrackWidth(releases.length);

  const markers = useMemo(
    () => (useDots ? layoutDotTimelineMarkers(releases, periodStart, periodEnd, trackWidth) : []),
    [useDots, releases, periodStart, periodEnd, trackWidth],
  );
  const milestones = useMemo(
    () => (useDots ? [] : layoutTimelineMilestones(releases, periodStart, periodEnd, trackWidth)),
    [useDots, releases, periodStart, periodEnd, trackWidth],
  );
  const periods = useMemo(() => {
    if (useDots) {
      const flat = markers.flatMap((m) =>
        m.kind === "single" ? [m.milestone] : m.members.map((mem) => ({ ...mem, _x: m._x, side: m.side })),
      );
      return buildPeriodSegments(flat);
    }
    return buildPeriodSegments(milestones);
  }, [useDots, markers, milestones]);

  const monthLabels = useMemo(
    () => (useDots ? buildMonthAxisLabels(periodStart, periodEnd, trackWidth) : undefined),
    [useDots, periodStart, periodEnd, trackWidth],
  );

  const today = new Date();
  const showToday = today >= periodStart && today <= periodEnd;
  const todayX = showToday ? dateToX(today, periodStart, periodEnd, trackWidth, useDots ? 56 : 90) : 0;
  const todayLabel = formatTodayMarkerLabel(today);

  if (releases.length === 0) {
    return (
      <div className="rounded-[24px] bg-white p-10 text-center text-slate-400 shadow-[0_18px_40px_-24px_rgba(112,144,176,0.18)] dark:bg-[var(--card)] dark:text-white/50">
        No releases in this period match the current filters.
      </div>
    );
  }

  return (
    <>
      {/* Mobile release list — gantt is desktop-first */}
      <div className="mb-3 space-y-2 md:hidden">
        <p className="text-[11px] text-slate-500 dark:text-white/45">
          {releases.length} release{releases.length === 1 ? "" : "s"} in this period
          {useDots ? " · open Expand for year timeline" : ""}
        </p>
        <ul className="space-y-2">
          {[...releases]
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map((r) => (
              <li key={r.id}>
                <ProgressLink
                  href={r.href}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 no-underline shadow-sm dark:border-slate-600 dark:bg-[var(--card)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-slate-800 dark:text-white">{r.code}</p>
                    <p className="truncate text-[12px] text-slate-500 dark:text-white/55">{r.name}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-semibold text-slate-600 dark:text-white/70">{r.status}</p>
                    <p className="text-[10px] text-slate-400 dark:text-white/45">
                      {new Date(r.date).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                </ProgressLink>
              </li>
            ))}
        </ul>
        {useDots && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[12.5px] font-semibold text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white/85"
          >
            <Expand size={14} /> Expand year timeline
          </button>
        )}
      </div>

      <div className="hidden overflow-visible rounded-[24px] bg-white px-4 py-5 shadow-[0_18px_40px_-24px_rgba(112,144,176,0.18)] md:block dark:bg-[var(--card)]">
        {useDots && (
          <div className="mb-3 flex items-center justify-between gap-2 px-2">
            <p className="text-[11px] text-slate-400 dark:text-white/40">
              Scroll horizontally · Expand for full-year fit
            </p>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white/85 dark:hover:bg-slate-700"
            >
              <Expand size={14} /> Expand View
            </button>
          </div>
        )}
        {!useDots && (
          <p className="mb-2 px-2 text-[11px] text-slate-400 dark:text-white/40">
            Scroll horizontally · hover or tap a marker for details
          </p>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            disabled={!canScrollLeft}
            aria-label="Scroll timeline left"
            className={cn(
              "absolute left-0 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-opacity dark:border-slate-600 dark:bg-slate-800 dark:text-white/80",
              canScrollLeft ? "opacity-100 hover:bg-slate-50 dark:hover:bg-slate-700" : "pointer-events-none opacity-30",
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            disabled={!canScrollRight}
            aria-label="Scroll timeline right"
            className={cn(
              "absolute right-0 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-opacity dark:border-slate-600 dark:bg-slate-800 dark:text-white/80",
              canScrollRight ? "opacity-100 hover:bg-slate-50 dark:hover:bg-slate-700" : "pointer-events-none opacity-30",
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div
            ref={scrollRef}
            onScroll={updateScrollState}
            className="overflow-x-auto overflow-y-visible px-10 py-6 [scrollbar-width:thin]"
          >
            <TimelineTrack
              milestones={milestones}
              markers={markers}
              periods={periods}
              useDots={useDots}
              trackWidth={trackWidth}
              trackHeight={useDots ? YEAR_DOT_TRACK_HEIGHT : TIMELINE_TRACK_HEIGHT}
              monthLabels={monthLabels}
              todayX={todayX}
              showToday={showToday}
              todayLabel={todayLabel}
            />
          </div>
        </div>
      </div>

      {useDots && (
        <TimelineExpandModal
          open={expanded}
          onClose={() => setExpanded(false)}
          releases={releases}
          periodStart={periodStart}
          periodEnd={periodEnd}
        />
      )}
    </>
  );
}
