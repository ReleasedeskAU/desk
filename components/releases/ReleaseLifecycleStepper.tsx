"use client";

/**
 * Config-driven lifecycle stepper: mainline rail + interrupt/branch panels.
 * Readiness/bookings/blockers are supporting evidence underneath — not a second stage system.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { loadJsonEffect } from "@/lib/safe-fetch";

type StepperPayload = {
  currentLabel: string;
  unknownStatus: boolean;
  stepper: {
    mainline: { key: string; label: string; state: "complete" | "current" | "upcoming" }[];
    interruptPanels: {
      key: string;
      label: string;
      kind: string;
      active: boolean;
    }[];
  };
  evidence: {
    openBlockerCount: number;
    hasUatBooking: boolean;
    hasDeployBooking: boolean;
    hardDependenciesMet: boolean;
    signoffsComplete: boolean;
    goLiveChecklistPercent: number | null;
  };
};

export type ReleaseLifecycleStepperProps = {
  releaseId: string;
  refreshKey?: number;
  /** Optional readiness % shown as evidence only. */
  readinessPercent?: number | null;
};

/**
 * Render the release lifecycle rail for the detail readiness section.
 */
export function ReleaseLifecycleStepper({
  releaseId,
  refreshKey = 0,
  readinessPercent,
}: ReleaseLifecycleStepperProps) {
  const [data, setData] = useState<StepperPayload | null>(null);

  useEffect(() => {
    return loadJsonEffect<StepperPayload>(
      `/api/releases/${releaseId}/lifecycle`,
      setData,
      { label: "release-lifecycle-stepper" }
    );
  }, [refreshKey, releaseId]);

  if (!data) {
    return (
      <p className="text-sm text-slate-500 dark:text-white/50">Loading lifecycle…</p>
    );
  }

  const { mainline, interruptPanels } = data.stepper;
  const activeInterrupt = interruptPanels.find((p) => p.active);

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
          Lifecycle journey
        </p>
        <p className="text-sm text-slate-600 dark:text-white/65">
          Current: <span className="font-semibold text-slate-900 dark:text-white">{data.currentLabel}</span>
          {data.unknownStatus ? " (not in config)" : ""}
          {activeInterrupt ? ` · on ${activeInterrupt.label} path` : ""}
        </p>
      </div>

      {/* Main rail */}
      <ol className="flex flex-col gap-0 md:flex-row md:items-start md:gap-0 md:overflow-x-auto">
        {mainline.map((step, idx) => {
          const isLast = idx === mainline.length - 1;
          return (
            <li
              key={step.key}
              className="flex min-w-0 flex-1 items-stretch gap-3 md:min-w-[5.5rem] md:flex-col md:items-center md:gap-2"
            >
              <div className="flex flex-col items-center md:w-full md:flex-row md:items-center">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold",
                    step.state === "complete" &&
                      "border-emerald-500 bg-emerald-500 text-white",
                    step.state === "current" &&
                      "border-violet-500 bg-violet-500 text-white ring-4 ring-violet-500/20",
                    step.state === "upcoming" &&
                      "border-slate-200 bg-white text-slate-400 dark:border-[var(--border)] dark:bg-[var(--card)]"
                  )}
                  aria-current={step.state === "current" ? "step" : undefined}
                >
                  {step.state === "complete" ? "✓" : idx + 1}
                </span>
                {!isLast && (
                  <span
                    className={cn(
                      "my-1 w-0.5 flex-1 min-h-[16px] md:my-0 md:h-0.5 md:min-h-0 md:w-full",
                      step.state === "complete"
                        ? "bg-emerald-300 dark:bg-emerald-600"
                        : "bg-slate-200 dark:bg-white/15"
                    )}
                  />
                )}
              </div>
              <p
                className={cn(
                  "pb-3 text-xs font-semibold md:pb-0 md:text-center",
                  step.state === "current" && "text-violet-700 dark:text-violet-300",
                  step.state === "complete" && "text-emerald-700 dark:text-emerald-400",
                  step.state === "upcoming" && "text-slate-400 dark:text-white/40"
                )}
              >
                {step.label}
              </p>
            </li>
          );
        })}
      </ol>

      {/* Interrupt / branch panels — not forced onto the straight line */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
          Interrupt & branch paths
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {interruptPanels.map((panel) => (
            <div
              key={panel.key}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-center text-xs font-semibold",
                panel.active
                  ? "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-100"
                  : "border-slate-200 bg-white text-slate-500 dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white/45"
              )}
            >
              {panel.label}
              <span className="mt-0.5 block text-[10px] font-normal opacity-70">
                {panel.kind}
                {panel.active ? " · active" : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Evidence under the rail — not a competing stage system */}
      <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3 dark:border-[var(--border)] dark:bg-white/5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
          Supporting evidence
        </p>
        <dl className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-white/65 sm:grid-cols-3">
          <div>
            <dt className="text-slate-400">Team readiness</dt>
            <dd className="font-semibold text-slate-800 dark:text-white">
              {readinessPercent == null ? "—" : `${Math.round(readinessPercent)}%`}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Open blockers</dt>
            <dd className="font-semibold text-slate-800 dark:text-white">
              {data.evidence.openBlockerCount}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">UAT booking</dt>
            <dd className="font-semibold text-slate-800 dark:text-white">
              {data.evidence.hasUatBooking ? "Yes" : "No"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Deploy booking</dt>
            <dd className="font-semibold text-slate-800 dark:text-white">
              {data.evidence.hasDeployBooking ? "Yes" : "No"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Hard deps</dt>
            <dd className="font-semibold text-slate-800 dark:text-white">
              {data.evidence.hardDependenciesMet ? "Clear" : "Open"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Go-live checklist</dt>
            <dd className="font-semibold text-slate-800 dark:text-white">
              {data.evidence.goLiveChecklistPercent == null
                ? "—"
                : `${Math.round(data.evidence.goLiveChecklistPercent)}%`}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
