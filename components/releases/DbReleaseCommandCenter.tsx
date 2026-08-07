"use client";

import { useEffect, useState } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { ReadinessGauge } from "@/components/gauges/ReadinessGauge";
import { ReleaseLifecycleStepper } from "@/components/releases/ReleaseLifecycleStepper";
import { DbPredictiveNudge } from "@/components/releases/DbPredictiveNudge";
import { EmptyHint, ScoreBar } from "@/components/detail/editable";
import type { DbNextAction } from "@/lib/db-release-command";
import type { DbReleasePrediction } from "@/lib/db-predictive";
import type { LifecycleStageView } from "@/lib/types";
import { ArrowRight } from "lucide-react";
import { loadJsonEffect } from "@/lib/safe-fetch";

export type CommandCenterData = {
  readiness: number;
  stages: LifecycleStageView[];
  nextActions: DbNextAction[];
  prediction?: DbReleasePrediction;
  p1Issues: { externalId: string; title: string; status: string; source: string; priority: string }[];
};

type UseReleaseCommandCenterArgs = {
  releaseId: string;
  refreshKey?: number;
  onReadinessChange?: (readiness: number) => void;
};

/**
 * Loads live readiness, lifecycle stages, prediction, and next actions for a release.
 *
 * @param args - Release id, optional refresh key, and readiness callback.
 * @returns Command-center payload or null while loading / on failure.
 * @sideEffects Fetches `/api/releases/:id/command-center`.
 */
export function useReleaseCommandCenter({
  releaseId,
  refreshKey = 0,
  onReadinessChange,
}: UseReleaseCommandCenterArgs): CommandCenterData | null {
  const [data, setData] = useState<CommandCenterData | null>(null);

  useEffect(() => {
    return loadJsonEffect<CommandCenterData>(
      `/api/releases/${releaseId}/command-center`,
      (next) => {
        setData(next);
        // Parent readiness lives outside this hook — defer so we never setState mid-commit.
        const notify = onReadinessChange;
        if (notify) queueMicrotask(() => notify(next.readiness));
      },
      { label: "release-command-center" }
    );
  }, [onReadinessChange, refreshKey, releaseId]);

  return data;
}

type ReadinessLifecycleContentProps = {
  releaseId: string;
  data: CommandCenterData;
  storedReadiness?: number | null;
  checklistPercent?: number | null;
  refreshKey?: number;
};

/**
 * Full Readiness & Lifecycle tile body: predictive nudge, config-driven
 * lifecycle stepper, readiness signal breakdown, and next-best-actions list.
 *
 * @param props - Command-center data plus stored/checklist readiness signals.
 * @returns Expanded tile content (existing intelligence, repositioned).
 */
export function ReadinessLifecycleContent({
  releaseId,
  data,
  storedReadiness,
  checklistPercent,
  refreshKey = 0,
}: ReadinessLifecycleContentProps) {
  return (
    <div className="space-y-5">
      {data.prediction && <DbPredictiveNudge prediction={data.prediction} />}

      <div>
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
          Release lifecycle
        </p>
        <ReleaseLifecycleStepper
          releaseId={releaseId}
          refreshKey={refreshKey}
          readinessPercent={storedReadiness ?? data.readiness}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-slate-50/80 p-4 dark:bg-white/5">
          <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
            Readiness signals
          </p>
          <div className="grid items-center gap-5 sm:grid-cols-[140px_1fr]">
            <div className="flex flex-col items-center">
              <ReadinessGauge value={data.readiness} size={132} />
              <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Computed live
              </span>
            </div>
            <div className="space-y-3">
              <ScoreBar
                value={storedReadiness ?? 0}
                asPercent
                label={storedReadiness == null ? "Stored readiness not set" : "Stored readiness"}
              />
              <ScoreBar
                value={checklistPercent ?? 0}
                asPercent
                label={checklistPercent == null ? "Go-live checklist not set" : "Go-live checklist"}
              />
              <p className="text-[11px] leading-relaxed text-slate-400 dark:text-white/45">
                Computed readiness uses status, bookings, dependencies, decision, open blockers, and P1
                issues. Stored values remain visible as separate planning signals.
              </p>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
            Next best actions
          </p>
          {data.nextActions.length ? (
            <ul className="space-y-2">
              {data.nextActions.map((action) => (
                <li key={`${action.href}-${action.label}`}>
                  {action.href.startsWith("#") ? (
                    <a
                      href={action.href}
                      className="group flex items-start gap-2 rounded-xl bg-amber-50/70 px-3 py-2.5 text-sm text-amber-900 transition-colors hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/15"
                    >
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 opacity-60 group-hover:opacity-100" />
                      <span>
                        <span className="font-semibold">{action.label}</span>
                        {action.detail && (
                          <span className="mt-0.5 block text-xs opacity-70">{action.detail}</span>
                        )}
                      </span>
                    </a>
                  ) : (
                    <ProgressLink
                      href={action.href}
                      className="group flex items-start gap-2 rounded-xl bg-amber-50/70 px-3 py-2.5 text-sm text-amber-900 transition-colors hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/15"
                    >
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 opacity-60 group-hover:opacity-100" />
                      <span>
                        <span className="font-semibold">{action.label}</span>
                        {action.detail && (
                          <span className="mt-0.5 block text-xs opacity-70">{action.detail}</span>
                        )}
                      </span>
                    </ProgressLink>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint>No urgent actions are currently recommended.</EmptyHint>
          )}
          {data.p1Issues.length > 0 && (
            <p className="mt-3 text-[11px] font-semibold text-rose-600 dark:text-rose-300">
              {data.p1Issues.length} linked P1 issue{data.p1Issues.length === 1 ? "" : "s"} included in
              readiness.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** @deprecated Prefer composing tiles with `useReleaseCommandCenter` + `ReadinessLifecycleContent`. */
export function DbReleaseCommandCenter({
  releaseId,
  storedReadiness,
  checklistPercent,
  refreshKey = 0,
  onReadinessChange,
}: {
  releaseId: string;
  storedReadiness?: number | null;
  checklistPercent?: number | null;
  refreshKey?: number;
  onReadinessChange?: (readiness: number) => void;
}) {
  const data = useReleaseCommandCenter({ releaseId, refreshKey, onReadinessChange });
  if (!data) {
    return <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />;
  }
  return (
    <ReadinessLifecycleContent
      releaseId={releaseId}
      data={data}
      storedReadiness={storedReadiness}
      checklistPercent={checklistPercent}
      refreshKey={refreshKey}
    />
  );
}
