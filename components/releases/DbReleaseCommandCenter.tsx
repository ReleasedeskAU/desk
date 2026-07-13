"use client";

import { useEffect, useState } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { ReadinessGauge } from "@/components/gauges/ReadinessGauge";
import { ReleaseLifecycleStrip } from "@/components/releases/ReleaseLifecycleStrip";
import { DbAIRiskPanel } from "@/components/releases/DbAIRiskPanel";
import { DbLinkedWorkItems } from "@/components/releases/DbLinkedWorkItems";
import { DbPredictiveNudge } from "@/components/releases/DbPredictiveNudge";
import { AdvancedCard } from "@/components/ui/advanced-card";
import type { DbNextAction } from "@/lib/db-release-command";
import type { DbReleasePrediction } from "@/lib/db-predictive";
import type { LifecycleStageView } from "@/lib/types";
import { ArrowRight, ListChecks } from "lucide-react";
import { loadJsonEffect } from "@/lib/safe-fetch";

type CommandCenterData = {
  readiness: number;
  stages: LifecycleStageView[];
  nextActions: DbNextAction[];
  prediction?: DbReleasePrediction;
  p1Issues: { externalId: string; title: string; status: string; source: string; priority: string }[];
};

/** Supplemental tools. Mockup Blockers/Drift sections live in DbReleaseDetail. */
export function DbReleaseCommandCenter({ releaseId }: { releaseId: string }) {
  const [data, setData] = useState<CommandCenterData | null>(null);

  useEffect(() => {
    return loadJsonEffect<CommandCenterData>(
      `/api/releases/${releaseId}/command-center`,
      setData,
      { label: "release-command-center" },
    );
  }, [releaseId]);

  if (!data) return null;

  return (
    <div className="space-y-6">
      {data.prediction && <DbPredictiveNudge prediction={data.prediction} />}
      <ReleaseLifecycleStrip stages={data.stages} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DbAIRiskPanel releaseId={releaseId} />
          <DbLinkedWorkItems releaseId={releaseId} />
        </div>

        <div className="space-y-6">
          <AdvancedCard title="Computed readiness" variant="glass" innerClassName="flex flex-col items-center py-6">
            <ReadinessGauge value={data.readiness} size={140} />
            <p className="mt-3 text-xs text-gray-500 dark:text-white/55 text-center px-4">
              Live score from status, bookings, dependencies, decision, open Blockers register rows, and P1 issues
              (may differ from stored Readiness % above)
            </p>
          </AdvancedCard>

          <AdvancedCard title="Next best actions" icon={ListChecks} variant="glass">
            <ul className="space-y-2">
              {data.nextActions.map((action) => (
                <li key={action.label}>
                  {action.href.startsWith("#") ? (
                    <a href={action.href} className="flex items-start gap-2 text-sm text-brand-600 dark:text-brand-400 hover:underline group">
                      <ArrowRight className="h-4 w-4 mt-0.5 shrink-0 opacity-60 group-hover:opacity-100" />
                      <span>
                        <span className="font-medium">{action.label}</span>
                        {action.detail && (
                          <span className="block text-xs text-gray-500 dark:text-white/50 mt-0.5">{action.detail}</span>
                        )}
                      </span>
                    </a>
                  ) : (
                    <ProgressLink href={action.href} className="flex items-start gap-2 text-sm text-brand-600 dark:text-brand-400 hover:underline group">
                      <ArrowRight className="h-4 w-4 mt-0.5 shrink-0 opacity-60 group-hover:opacity-100" />
                      <span>
                        <span className="font-medium">{action.label}</span>
                        {action.detail && (
                          <span className="block text-xs text-gray-500 dark:text-white/50 mt-0.5">{action.detail}</span>
                        )}
                      </span>
                    </ProgressLink>
                  )}
                </li>
              ))}
            </ul>
          </AdvancedCard>
        </div>
      </div>
    </div>
  );
}
