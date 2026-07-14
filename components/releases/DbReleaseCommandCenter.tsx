"use client";

import { useEffect, useState } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { ReadinessGauge } from "@/components/gauges/ReadinessGauge";
import { ReleaseLifecycleStrip } from "@/components/releases/ReleaseLifecycleStrip";
import { DbAIRiskPanel } from "@/components/releases/DbAIRiskPanel";
import { DbLinkedWorkItems } from "@/components/releases/DbLinkedWorkItems";
import { DbPredictiveNudge } from "@/components/releases/DbPredictiveNudge";
import { DetailSection, EmptyHint, ScoreBar } from "@/components/detail/editable";
import type { DbNextAction } from "@/lib/db-release-command";
import type { DbReleasePrediction } from "@/lib/db-predictive";
import type { LifecycleStageView } from "@/lib/types";
import { Activity, ArrowRight, Gauge, ListChecks, Rocket, ShieldAlert } from "lucide-react";
import { loadJsonEffect } from "@/lib/safe-fetch";

export type CommandCenterData = {
  readiness: number;
  stages: LifecycleStageView[];
  nextActions: DbNextAction[];
  prediction?: DbReleasePrediction;
  p1Issues: { externalId: string; title: string; status: string; source: string; priority: string }[];
};

type DbReleaseCommandCenterProps = {
  releaseId: string;
  storedReadiness?: number | null;
  checklistPercent?: number | null;
  refreshKey?: number;
  onReadinessChange?: (readiness: number) => void;
};

/** Live release intelligence, lifecycle, readiness signals, and recommended actions. */
export function DbReleaseCommandCenter({
  releaseId,
  storedReadiness,
  checklistPercent,
  refreshKey = 0,
  onReadinessChange,
}: DbReleaseCommandCenterProps) {
  const [data, setData] = useState<CommandCenterData | null>(null);

  useEffect(() => {
    return loadJsonEffect<CommandCenterData>(
      `/api/releases/${releaseId}/command-center`,
      (next) => {
        setData(next);
        onReadinessChange?.(next.readiness);
      },
      { label: "release-command-center" },
    );
  }, [onReadinessChange, refreshKey, releaseId]);

  if (!data) {
    return (
      <DetailSection
        icon={Activity}
        tone="indigo"
        title="Release intelligence"
        description="Loading lifecycle, operational readiness, risks, and recommended actions."
      >
        <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
      </DetailSection>
    );
  }

  return (
    <div className="space-y-4">
      {data.prediction && <DbPredictiveNudge prediction={data.prediction} />}

      <DetailSection
        icon={Rocket}
        tone="violet"
        title="Release lifecycle"
        description="A live view of progress from planning and scheduling through deployment."
      >
        <ReleaseLifecycleStrip stages={data.stages} embedded />
      </DetailSection>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetailSection
          icon={Gauge}
          tone="emerald"
          title="Readiness signals"
          description="Computed operational readiness alongside stored planning and checklist progress."
        >
          <div className="grid items-center gap-5 sm:grid-cols-[160px_1fr]">
            <div className="flex flex-col items-center">
              <ReadinessGauge value={data.readiness} size={148} />
              <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Computed live
              </span>
            </div>
            <div className="space-y-4">
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
                Computed readiness uses status, bookings, dependencies, decision, open blockers, and P1 issues.
                Stored values remain visible as separate planning signals.
              </p>
            </div>
          </div>
        </DetailSection>

        <DetailSection
          icon={ListChecks}
          tone="amber"
          title="Next best actions"
          description="The highest-value steps to move this release safely toward deployment."
        >
          {data.nextActions.length ? (
            <ul className="space-y-2.5">
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
                        {action.detail && <span className="mt-0.5 block text-xs opacity-70">{action.detail}</span>}
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
                        {action.detail && <span className="mt-0.5 block text-xs opacity-70">{action.detail}</span>}
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
              {data.p1Issues.length} linked P1 issue{data.p1Issues.length === 1 ? "" : "s"} included in readiness.
            </p>
          )}
        </DetailSection>
      </div>

      <DetailSection
        icon={ShieldAlert}
        tone="rose"
        title="Go-live intelligence"
        description="AI-assisted risk flags and linked delivery work, kept alongside the operational facts."
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <DbAIRiskPanel releaseId={releaseId} />
          <DbLinkedWorkItems releaseId={releaseId} />
        </div>
      </DetailSection>
    </div>
  );
}
