"use client";

import { ProgressLink } from "@/components/layout/NavigationProgress";
import type { ScheduleColumn } from "@/lib/calendar-schedule";
import { columnIndexForDate } from "@/lib/calendar-schedule";
import type { UnifiedRelease } from "@/lib/unified-releases";
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import { mapReleaseStatusToTimeline } from "@/lib/release-timeline";
import { cn, formatDate } from "@/lib/utils";

const TIMELINE_TONE_BAR: Record<string, string> = {
  rose: "bg-error-500",
  amber: "bg-amber-500",
  emerald: "bg-success-500",
  indigo: "bg-brand-500",
  violet: "bg-fuchsia-500",
};

type ViewMode = "calendar" | "timeline";

export function ReleaseScheduleGrid({
  releases,
  columns,
  mode,
  lifecycleConfig = null,
}: {
  releases: UnifiedRelease[];
  columns: ScheduleColumn[];
  mode: ViewMode;
  lifecycleConfig?: ReleaseLifecycleConfig | null;
}) {
  const sorted = [...releases].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const minColWidth = columns.length > 20 ? 36 : columns.length > 12 ? 44 : 52;

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No releases in this period for the selected filters.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-theme-sm overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Dates on top (horizontal X axis) */}
          <div className="flex border-b border-gray-200 bg-gray-50/90 sticky top-0 z-20">
            <div className="sticky left-0 z-30 w-[220px] shrink-0 border-r border-gray-200 bg-gray-50 px-3 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Release</span>
            </div>
            {columns.map((col) => (
              <div
                key={col.key}
                className="shrink-0 border-r border-gray-100 px-1 py-2 text-center"
                style={{ width: minColWidth }}
              >
                <div className="text-xs font-semibold text-gray-800">{col.label}</div>
                {col.subLabel && (
                  <div className="text-[10px] text-gray-400 leading-tight mt-0.5">{col.subLabel}</div>
                )}
              </div>
            ))}
          </div>

          {/* Release rows (Y axis) */}
          {sorted.map((release) => {
            const colIdx = columnIndexForDate(release.date, columns);
            const { tone } = mapReleaseStatusToTimeline(
              release.status,
              lifecycleConfig
            );
            const barColor = TIMELINE_TONE_BAR[tone] ?? "bg-gray-400";

            return (
              <div
                key={`${release.source}-${release.id}`}
                className="flex border-b border-gray-100 last:border-b-0 hover:bg-brand-50/30 transition-colors"
              >
                <div className="sticky left-0 z-10 w-[220px] shrink-0 border-r border-gray-200 bg-white px-3 py-2.5">
                  <ProgressLink href={release.href} className="block group">
                    <span className="font-mono text-xs font-semibold text-brand-600 group-hover:underline">
                      {release.code}
                    </span>
                    <span className="block text-xs text-gray-700 truncate mt-0.5">{release.name}</span>
                    <span className="block text-[10px] text-gray-400 mt-0.5">{formatDate(release.date)}</span>
                  </ProgressLink>
                </div>

                <div className="flex flex-1">
                  {columns.map((col, i) => {
                    const active = i === colIdx;
                    return (
                      <div
                        key={col.key}
                        className={cn(
                          "shrink-0 border-r border-gray-50 flex items-center justify-center",
                          mode === "calendar" ? "h-14" : "h-10"
                        )}
                        style={{ width: minColWidth }}
                      >
                        {active && mode === "calendar" && (
                          <ProgressLink
                            href={release.href}
                            title={`${release.code} · ${release.status}`}
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-lg text-[9px] font-bold text-white shadow-theme-sm hover:scale-105 transition-transform",
                              barColor
                            )}
                          >
                            {release.code.replace(/^REL-|^v/i, "").slice(0, 4)}
                          </ProgressLink>
                        )}
                        {active && mode === "timeline" && (
                          <ProgressLink
                            href={release.href}
                            title={`${release.code} · ${release.status}`}
                            className="w-full px-1"
                          >
                            <div
                              className={cn("h-2.5 rounded-full shadow-sm", barColor)}
                              style={{ minWidth: Math.max(minColWidth - 8, 24) }}
                            />
                          </ProgressLink>
                        )}
                      </div>
                    );
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
