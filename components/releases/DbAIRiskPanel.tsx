"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentBadge } from "@/components/badges/AgentBadge";
import { AICardSkeleton } from "@/components/ui/AISkeleton";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { callAgent } from "@/lib/agent-client";
import type { DbRiskAgentContext } from "@/lib/db-ai-context";
import { blockersToRiskFlags } from "@/lib/db-ai-context";
import type { RiskFlag } from "@/lib/types";
import { RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { loadJsonEffect } from "@/lib/safe-fetch";

const FLAG_STYLES = {
  high: {
    card: "border-error-200/80 bg-error-50/90 dark:border-error-500/30 dark:bg-error-500/12",
    badge: "bg-error-100 text-error-700 dark:bg-error-500/25 dark:text-error-400",
  },
  medium: {
    card: "border-warning-200/80 bg-warning-50/90 dark:border-warning-500/30 dark:bg-warning-500/12",
    badge: "bg-warning-100 text-warning-700 dark:bg-warning-500/25 dark:text-warning-400",
  },
  low: {
    card: "border-gray-200 bg-gray-50/90 dark:border-[var(--border)] dark:bg-white/5",
    badge: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/65",
  },
} as const;

type DbAIRiskPanelProps = {
  releaseId: string;
  /** Compact command-center strip: top 3 insights + next step + re-run. */
  compact?: boolean;
  /** Optional recommended next step shown under insights (from next-best-actions). */
  recommendedNextStep?: string | null;
};

/**
 * Live Risk Agent analysis for a release. Compact mode surfaces top insights
 * for the dashboard; full mode keeps the original card layout.
 *
 * @param props - Release id, optional compact layout, optional next-step label.
 * @returns AI risk insights panel with re-run control.
 * @sideEffects Calls `/api/releases/:id/ai-context` and `/api/agent`.
 */
export function DbAIRiskPanel({
  releaseId,
  compact = false,
  recommendedNextStep = null,
}: DbAIRiskPanelProps) {
  const [context, setContext] = useState<DbRiskAgentContext | null>(null);
  const [flags, setFlags] = useState<RiskFlag[]>([]);
  const [contextLoading, setContextLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const mountedRef = useRef(false);
  const analysisStartedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    analysisStartedRef.current = false;
    setContext(null);
    setFlags([]);
    setError(null);
    setUsedFallback(false);
    setContextLoading(true);
    return loadJsonEffect<DbRiskAgentContext>(
      `/api/releases/${releaseId}/ai-context`,
      (data) => {
        if (mountedRef.current) setContext(data);
      },
      {
        label: "release-ai-context",
        onFinally: () => {
          if (mountedRef.current) setContextLoading(false);
        },
      }
    );
  }, [releaseId]);

  const runAnalysis = useCallback(async () => {
    if (!context || !mountedRef.current) return;
    setAnalyzing(true);
    setError(null);
    setUsedFallback(false);

    const res = await callAgent({
      agentRole: "Risk Agent",
      context,
      mode: "structured",
    });

    if (!mountedRef.current) return;
    setAnalyzing(false);

    if (res.flags?.length) {
      setFlags(res.flags as RiskFlag[]);
      return;
    }

    const err = res.error ?? "";
    setFlags(blockersToRiskFlags(context.blockers, context.release.releaseCode, context.readiness));
    setUsedFallback(true);
    if (err && !/api key|llm|unavailable|timed out/i.test(err)) {
      setError(err);
    }
  }, [context]);

  useEffect(() => {
    if (!context || flags.length || analyzing || analysisStartedRef.current) return;
    analysisStartedRef.current = true;
    void runAnalysis();
  }, [context, flags.length, analyzing, runAnalysis]);

  const visibleFlags = compact ? flags.slice(0, 3) : flags;
  const topWhy = visibleFlags[0]?.explanation ?? null;

  if (compact) {
    return (
      <div className="rounded-2xl border border-violet-200/70 border-l-[4px] border-l-violet-500 bg-gradient-to-r from-violet-50/80 via-white to-white px-4 py-3 shadow-sm dark:border-violet-500/30 dark:from-violet-500/10 dark:via-[var(--card)] dark:to-[var(--card)]">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
              <Sparkles size={15} aria-hidden />
            </span>
            <div>
              <p className="text-[13px] font-bold text-slate-800 dark:text-white">AI Insights</p>
              <p className="text-[11px] text-slate-400 dark:text-white/45">Top signals · Risk Agent</p>
            </div>
            <AgentBadge agent="Risk Agent" />
          </div>
          <button
            type="button"
            className={cn(taBtnSecondary, "!py-1.5 !text-xs")}
            onClick={runAnalysis}
            disabled={analyzing || !context}
          >
            {analyzing ? (
              <>
                <RefreshCw className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Analyzing…
              </>
            ) : (
              "Re-run analysis"
            )}
          </button>
        </div>

        {(contextLoading || analyzing) && <AICardSkeleton />}
        {error && !analyzing && <p className="mb-2 text-sm text-error-600 dark:text-error-400">{error}</p>}
        {usedFallback && !analyzing && flags.length > 0 && (
          <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-400">
            Rule-based flags — add an LLM key for full Risk Agent output.
          </p>
        )}

        {!analyzing && !contextLoading && visibleFlags.length > 0 && (
          <div className="grid gap-2 lg:grid-cols-[1.2fr_0.8fr]">
            <ul className="space-y-1.5">
              {visibleFlags.map((f, i) => {
                const styles = FLAG_STYLES[f.severity] ?? FLAG_STYLES.low;
                return (
                  <li
                    key={`${f.title}-${i}`}
                    className={cn("flex items-start justify-between gap-2 rounded-lg border px-2.5 py-1.5", styles.card)}
                  >
                    <p className="text-[12.5px] font-semibold text-gray-900 dark:text-white">{f.title}</p>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] capitalize", styles.badge)}>
                      {f.severity}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="space-y-2 rounded-xl bg-white/70 px-3 py-2 dark:bg-white/5">
              {topWhy && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Why?</p>
                  <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-slate-600 dark:text-white/70">
                    {topWhy}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Recommended next step
                </p>
                <p className="mt-0.5 text-[12.5px] font-semibold text-indigo-700 dark:text-indigo-300">
                  {recommendedNextStep ?? visibleFlags[0]?.title ?? "Review readiness signals"}
                </p>
              </div>
            </div>
          </div>
        )}

        {!analyzing && !contextLoading && visibleFlags.length === 0 && (
          <p className="text-[12.5px] text-slate-500 dark:text-white/55">No AI risk flags for this release.</p>
        )}
      </div>
    );
  }

  return (
    <AdvancedCard
      title="AI risk analysis"
      icon={ShieldAlert}
      variant="ai"
      action={<AgentBadge agent="Risk Agent" />}
    >
      <p className="mb-3 text-xs text-gray-500 dark:text-white/60">
        Live analysis from readiness, blockers, slip impact, Jira items, and env bookings for{" "}
        {context?.release.releaseCode ?? "this release"}.
      </p>

      {contextLoading && <AICardSkeleton />}

      {context && !contextLoading && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={taBtnSecondary + " text-sm !py-2"}
            onClick={runAnalysis}
            disabled={analyzing}
          >
            {analyzing ? (
              <>
                <RefreshCw className="mr-1 inline h-4 w-4 animate-spin" /> Analyzing…
              </>
            ) : (
              "Re-run analysis"
            )}
          </button>
        </div>
      )}

      {analyzing && <AICardSkeleton />}

      {error && !analyzing && <p className="mb-3 text-sm text-error-600 dark:text-error-400">{error}</p>}

      {usedFallback && !analyzing && flags.length > 0 && (
        <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">
          Showing rule-based flags — add OPENAI_API_KEY or ANTHROPIC_API_KEY for full Risk Agent output.
        </p>
      )}

      {!analyzing && flags.length > 0 && (
        <ul className="space-y-3">
          {flags.map((f, i) => {
            const styles = FLAG_STYLES[f.severity] ?? FLAG_STYLES.low;
            return (
              <li key={i} className={cn("rounded-xl border p-3", styles.card)}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{f.title}</p>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs capitalize", styles.badge)}>
                    {f.severity}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-white/75">{f.explanation}</p>
                {f.citations?.length > 0 && (
                  <p className="mt-2 text-xs text-gray-400 dark:text-white/45">
                    Sources: {f.citations.join(" · ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AdvancedCard>
  );
}
