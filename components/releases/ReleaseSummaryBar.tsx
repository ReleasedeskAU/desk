"use client";

import { ProgressLink } from "@/components/layout/NavigationProgress";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/utils";
import type { DbNextAction } from "@/lib/db-release-command";
import { ArrowRight } from "lucide-react";

function healthClass(health?: string | null): string {
  const h = (health ?? "").toLowerCase();
  if (h.includes("no-go") || h.includes("nogo") || h.includes("red")) {
    return "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300";
  }
  if (h.includes("go") || h.includes("green") || h.includes("ready")) {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300";
  }
  if (h.includes("caution") || h.includes("amber") || h.includes("at risk")) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300";
  }
  return "bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-white/80";
}

function readinessTone(value: number): string {
  if (value >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (value >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export type ReleaseSummaryBarProps = {
  releaseCode: string;
  name: string;
  status: string;
  releaseHealth?: string | null;
  /** Live operational readiness (headline KPI). */
  headlineReadiness: number;
  slipRisk?: number | null;
  envConflict?: boolean;
  urgentAction?: DbNextAction | null;
};

/**
 * At-a-glance command bar: identity, status, readiness, slip risk, env conflict, next action.
 *
 * @param props - Six primary release signals for scan-first awareness.
 * @returns Thin horizontal dashboard summary strip.
 */
export function ReleaseSummaryBar({
  releaseCode,
  name,
  status,
  releaseHealth,
  headlineReadiness,
  slipRisk,
  envConflict = false,
  urgentAction,
}: ReleaseSummaryBarProps) {
  return (
    <div className="rounded-2xl border border-slate-100/80 border-l-[4px] border-l-indigo-500 bg-white px-4 py-2.5 shadow-sm dark:border-[var(--border)] dark:bg-[var(--card)] sm:px-5">
      <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-slate-800 dark:text-white">{releaseCode}</span>
          <span className="hidden text-slate-300 sm:inline dark:text-white/25">·</span>
          <span className="max-w-[240px] truncate text-sm font-semibold text-slate-700 dark:text-white/85 sm:max-w-xs">
            {name}
          </span>
          <StatusBadge status={status as "Ready"} />
          {releaseHealth && (
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                healthClass(releaseHealth)
              )}
            >
              {releaseHealth}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <Signal
            label="Readiness"
            value={`${headlineReadiness}%`}
            valueClass={readinessTone(headlineReadiness)}
          />
          <Signal
            label="Slip risk"
            value={slipRisk == null ? "—" : `${Math.round(slipRisk)}%`}
            valueClass={
              (slipRisk ?? 0) >= 60
                ? "text-rose-600 dark:text-rose-400"
                : (slipRisk ?? 0) >= 40
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-slate-700 dark:text-white/80"
            }
          />
          <Signal
            label="Env conflict"
            value={envConflict ? "Yes" : "No"}
            valueClass={
              envConflict ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
            }
          />
          <div className="min-w-0 border-l border-slate-100 pl-3 dark:border-[var(--border)] sm:max-w-[260px]">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
              Next best action
            </p>
            {urgentAction ? (
              urgentAction.href.startsWith("#") ? (
                <a
                  href={urgentAction.href}
                  className="mt-0.5 flex items-start gap-1 text-[13px] font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                >
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  <span className="line-clamp-2">{urgentAction.label}</span>
                </a>
              ) : (
                <ProgressLink
                  href={urgentAction.href}
                  className="mt-0.5 flex items-start gap-1 text-[13px] font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                >
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  <span className="line-clamp-2">{urgentAction.label}</span>
                </ProgressLink>
              )
            ) : (
              <p className="mt-0.5 text-[13px] text-slate-500 dark:text-white/55">No urgent action</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Signal({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="border-l border-slate-100 pl-3 dark:border-[var(--border)] first:border-l-0 first:pl-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
        {label}
      </p>
      <p className={cn("text-xl font-extrabold tracking-tight tabular-nums", valueClass)}>{value}</p>
    </div>
  );
}
