"use client";

import { useState } from "react";
import { Clock, Sparkles } from "lucide-react";
import { AgentBadge } from "@/components/badges/AgentBadge";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { AICardSkeleton } from "@/components/ui/AISkeleton";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { useReleaseStore } from "@/context/ReleaseStoreContext";
import { callAgent } from "@/lib/agent-client";
import { getCurrentSnapshotSummary, getYesterdaySnapshot } from "@/lib/release-snapshot";
import type { Release } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export function YesterdayDiffPanel({ release }: { release: Release }) {
  const { getReleaseDecision } = useReleaseStore();
  const storedDecision = getReleaseDecision(release.id)?.decision ?? null;
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const yesterday = getYesterdaySnapshot(release);
  const current = getCurrentSnapshotSummary(release, storedDecision);

  const ask = async () => {
    setLoading(true);
    setAnswer(null);
    const res = await callAgent({
      agentRole: "Conversation Agent",
      context: {
        mode: "yesterday-diff",
        release: { id: release.id, version: release.version, team: release.team },
        yesterday,
        current,
        recordedDecision: storedDecision,
      },
      userMessage: `What changed on ${release.version} in the last 24 hours? Compare yesterday vs now.`,
    });
    setAnswer(res.text ?? res.error ?? "AI unavailable");
    setLoading(false);
  };

  return (
    <AdvancedCard
      title="What changed since yesterday?"
      subtitle={`Snapshot from ${formatDateTime(yesterday.capturedAt)}`}
      icon={Clock}
      variant="ai"
      action={
        <button
          type="button"
          onClick={ask}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-ai px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" /> Ask ReleaseDesk Everywhere
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <div className="rounded-lg border border-gray-100 bg-white/60 p-3">
          <p className="text-[10px] uppercase text-gray-400 mb-2">24h ago</p>
          <p className="font-bold text-gray-800">{yesterday.readiness}% ready</p>
          <p className="text-xs text-gray-500 mt-1">{yesterday.blockers.length} blocker(s)</p>
          <StatusBadge status={yesterday.buildStatus} className="mt-2" />
        </div>
        <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-3">
          <p className="text-[10px] uppercase text-gray-400 mb-2">Now</p>
          <p className="font-bold text-gray-800">{current.readiness}% ready</p>
          <p className="text-xs text-gray-500 mt-1">{current.blockers.length} blocker(s)</p>
          {storedDecision && (
            <p className="text-xs text-brand-600 mt-1">Recorded decision: {storedDecision}</p>
          )}
          <StatusBadge status={current.buildStatus} className="mt-2" />
        </div>
      </div>

      <ul className="text-xs text-gray-600 space-y-1 mb-4 list-disc list-inside">
        {yesterday.structuredChanges.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>

      {loading && <AICardSkeleton />}
      {answer && !loading && (
        <div className="rounded-xl border border-brand-50 bg-white/80 p-4">
          <AgentBadge agent="Conversation Agent" className="mb-2" />
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{answer}</p>
        </div>
      )}
    </AdvancedCard>
  );
}
