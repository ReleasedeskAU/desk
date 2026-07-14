"use client";

import { ProgressLink } from "@/components/layout/NavigationProgress";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { BlockerList } from "@/components/releases/BlockerList";
import { ApprovalChecklist } from "@/components/releases/ApprovalChecklist";
import { AIRiskPanel } from "@/components/releases/AIRiskPanel";
import { BuildExplainer } from "@/components/releases/BuildExplainer";
import { ApprovalNudge } from "@/components/releases/ApprovalNudge";
import { CabPanel } from "@/components/releases/CabPanel";
import { DeploymentMonitor } from "@/components/releases/DeploymentMonitor";
import { EnvironmentPromotionStrip } from "@/components/releases/EnvironmentPromotionStrip";
import { GoNoGoControls } from "@/components/releases/GoNoGoControls";
import { ReleaseLifecycleStrip } from "@/components/releases/ReleaseLifecycleStrip";
import { ReleaseScorecardButton } from "@/components/releases/ReleaseScorecard";
import { ReleaseRelatedLinks } from "@/components/releases/ReleaseRelatedLinks";
import { YesterdayDiffPanel } from "@/components/releases/YesterdayDiffPanel";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { useReleaseStore } from "@/context/ReleaseStoreContext";
import { useNavHistoryLabel } from "@/context/NavigationHistoryContext";
import { releases } from "@/lib/dummy-data";
import { computeLifecycleStages } from "@/lib/lifecycle";
import { formatDate, formatDateTime } from "@/lib/utils";
import { GitBranch, Network, Ticket, Wrench, FileText, History, Columns2 } from "lucide-react";

export function SyntheticReleaseDetail({ id }: { id: string }) {
  const release = releases.find((r) => r.id === id);
  const { getReleaseDecision, getReleaseHistory, getDeploymentState } = useReleaseStore();
  const stored = release ? getReleaseDecision(release.id) : null;
  const decision = stored?.decision ?? release?.decision ?? null;
  const history = release ? getReleaseHistory(release.id, release.history) : [];
  const deploy = release ? getDeploymentState(release) : null;
  const stages = release && deploy ? computeLifecycleStages(release, decision, deploy.phase) : [];

  useNavHistoryLabel(release?.version);
  if (!release) {
    return <div className="text-slate-500">Release not found.</div>;
  }

  return (
    <div>
      <div className="mb-4 rounded-xl border border-brand-100 bg-brand-25/80 px-4 py-2 text-xs text-brand-700">
        Demo release command center — synthetic data with live Go/No-Go, deployment, and CAB panels. Use{" "}
        <ProgressLink href="/templates" className="font-semibold underline">Quick Start</ProgressLink> scenarios to explore.
      </div>

      <TopBar title={`${release.version} — ${release.name}`} subtitle={`${release.team} · Owner: ${release.owner} · Target: ${formatDate(release.targetDate)}`} highlight />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge status={release.status} />
        {decision && <StatusBadge status={decision} />}
        {deploy && deploy.phase !== "Not Started" && <StatusBadge status={deploy.phase} />}
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <ReleaseScorecardButton release={release} decision={decision} />
          <ProgressLink
            href={`/compare?left=${release.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2 text-sm font-medium text-gray-700 shadow-theme-sm transition-colors hover:bg-brand-50 hover:text-brand-600"
          >
            <Columns2 className="h-4 w-4" /> Compare
          </ProgressLink>
          <ProgressLink
            href={`/releases/${release.id}/dependencies`}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-500 transition-colors hover:text-brand-600"
          >
            <Network className="h-4 w-4" /> Dependency Map
          </ProgressLink>
        </div>
      </div>

      <ReleaseLifecycleStrip stages={stages} />
      <ReleaseRelatedLinks releaseId={release.id} />

      <div className="mt-6">
        <EnvironmentPromotionStrip release={release} deployPhase={deploy?.phase} />
      </div>
      <div className="mt-6">
        <YesterdayDiffPanel release={release} />
      </div>
      <div className="mt-6">
        <ApprovalNudge release={release} />
      </div>
      <div className="mt-6">
        <CabPanel release={release} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 space-y-6">
          <DeploymentMonitor release={release} decision={decision} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <GoNoGoControls release={release} />
            <BlockerList release={release} />
          </div>
          <AIRiskPanel release={release} />
          <BuildExplainer release={release} />
          <ApprovalChecklist release={release} />

          <AdvancedCard title="Linked Tickets" icon={Ticket} variant="glass">
            <div className="space-y-2">
              {release.tickets.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div><span className="text-xs text-gray-400">{t.id}</span><p className="text-sm text-gray-700">{t.title}</p></div>
                  <StatusBadge status={t.status === "Done" ? "Approved" : t.status === "Blocked" ? "Blocked" : "Pending"} />
                </div>
              ))}
            </div>
          </AdvancedCard>

          <AdvancedCard title="Build Status" icon={Wrench} variant="default">
            <div className="flex items-center gap-4 flex-wrap">
              <StatusBadge status={release.build.status} />
              <span className="text-sm text-gray-600">Build #{release.build.id} · {release.build.pipeline}</span>
              <span className="text-sm text-gray-400">{formatDateTime(release.build.lastRun)}</span>
            </div>
            <p className="text-sm text-gray-500 mt-2">{release.build.passedTests}/{release.build.testCount} tests passed</p>
          </AdvancedCard>

          {release.notes && (
            <AdvancedCard title="Notes" icon={FileText} variant="plain">
              <p className="text-sm text-gray-600">{release.notes}</p>
            </AdvancedCard>
          )}
        </div>

        <div className="space-y-6">
          <AdvancedCard title="Commits" icon={GitBranch} variant="glass">
            {release.commits.map((c) => (
              <div key={c.sha} className="py-2 border-b border-gray-100 last:border-0">
                <code className="text-xs bg-slate-100 px-1 rounded">{c.sha}</code>
                <p className="text-sm text-gray-700 mt-1">{c.message}</p>
                <p className="text-xs text-gray-400">{c.author} · {formatDateTime(c.timestamp)}</p>
              </div>
            ))}
            <p className="text-xs text-gray-400 mt-3">{release.filesChanged} files changed</p>
          </AdvancedCard>

          <AdvancedCard title="History" icon={History} variant="default">
            {history.map((h) => (
              <div key={h.id} className="py-2 border-b border-gray-100 last:border-0 text-sm">
                <p className="text-gray-700">{h.action}</p>
                <p className="text-xs text-gray-400">{h.actor} · {formatDateTime(h.timestamp)}</p>
              </div>
            ))}
          </AdvancedCard>
        </div>
      </div>
    </div>
  );
}

export function isSyntheticReleaseId(id: string) {
  return releases.some((r) => r.id === id);
}
