"use client";

import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, CheckCircle2, Circle, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRiskLevel } from "@/lib/risk-level";
import {
  DEFAULT_RISK_ENGINE_CONFIG,
  simpleRiskMatrixFill,
  type RiskEngineConfig,
} from "@/lib/risk-engine-config";

type VisualTone = "indigo" | "rose" | "emerald" | "sky" | "violet" | "amber";

const TONE: Record<VisualTone, { node: string; line: string; text: string }> = {
  indigo: {
    node: "bg-indigo-600 text-white",
    line: "bg-indigo-300 dark:bg-indigo-500/50",
    text: "text-indigo-700 dark:text-indigo-300",
  },
  rose: {
    node: "bg-rose-600 text-white",
    line: "bg-rose-300 dark:bg-rose-500/50",
    text: "text-rose-700 dark:text-rose-300",
  },
  emerald: {
    node: "bg-emerald-600 text-white",
    line: "bg-emerald-300 dark:bg-emerald-500/50",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  sky: {
    node: "bg-sky-600 text-white",
    line: "bg-sky-300 dark:bg-sky-500/50",
    text: "text-sky-700 dark:text-sky-300",
  },
  violet: {
    node: "bg-violet-600 text-white",
    line: "bg-violet-300 dark:bg-violet-500/50",
    text: "text-violet-700 dark:text-violet-300",
  },
  amber: {
    node: "bg-amber-500 text-white",
    line: "bg-amber-300 dark:bg-amber-500/50",
    text: "text-amber-700 dark:text-amber-300",
  },
};

export type TimelinePhase = {
  label: string;
  detail?: ReactNode;
  complete?: boolean;
  active?: boolean;
  tone?: VisualTone;
};

/** Render a responsive milestone timeline from real entity dates and states. */
export function EntityTimeline({ phases }: { phases: TimelinePhase[] }) {
  return (
    <ol
      className="grid gap-3 sm:grid-cols-[repeat(var(--phase-count),minmax(0,1fr))]"
      style={{ "--phase-count": phases.length } as CSSProperties}
    >
      {phases.map((phase, index) => {
        const tone = TONE[phase.tone ?? "indigo"];
        const Icon = phase.complete ? CheckCircle2 : phase.active ? Clock3 : Circle;
        return (
          <li key={`${phase.label}-${index}`} className="relative min-w-0">
            <div className="flex items-center">
              <span className={cn("relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm", tone.node)}>
                <Icon size={16} aria-hidden />
              </span>
              {index < phases.length - 1 && <span className={cn("hidden h-1 flex-1 rounded-full sm:block", tone.line)} />}
            </div>
            <p className={cn("mt-2 text-[10.5px] font-bold uppercase tracking-wide", tone.text)}>{phase.label}</p>
            {phase.detail && <div className="mt-0.5 text-[11px] leading-snug text-slate-400 dark:text-white/45">{phase.detail}</div>}
          </li>
        );
      })}
    </ol>
  );
}

/** Show a directional relationship without implying unavailable graph data. */
export function EntityConnection({
  source,
  target,
  caption,
}: {
  source: ReactNode;
  target: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-indigo-50 via-white to-sky-50 p-4 dark:from-indigo-500/10 dark:via-white/5 dark:to-sky-500/10">
      <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-slate-800 shadow-sm dark:bg-white/10 dark:text-white">
          {source}
        </div>
        <ArrowRight className="mx-auto h-5 w-5 rotate-90 text-indigo-500 sm:rotate-0" aria-hidden />
        <div className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-slate-800 shadow-sm dark:bg-white/10 dark:text-white">
          {target}
        </div>
      </div>
      {caption && <p className="mt-3 text-center text-[11px] text-slate-400 dark:text-white/45">{caption}</p>}
    </div>
  );
}

/** Plot one stored likelihood/impact pair on a risk matrix sized by config scale.
 * Cell colors use the SAME getRiskLevel resolver as list/heat-map/detail — never a private cutoff table.
 */
export function RiskMatrix({
  likelihood,
  impact,
  likelihoodMax = 5,
  impactMax = 5,
  config = DEFAULT_RISK_ENGINE_CONFIG,
}: {
  likelihood: number;
  impact: number;
  likelihoodMax?: number;
  impactMax?: number;
  /** When provided, band cutoffs come from user config; otherwise shipped defaults. */
  config?: Pick<RiskEngineConfig, "simpleBands">;
}) {
  const maxL = Math.max(2, Math.min(10, likelihoodMax));
  const maxI = Math.max(2, Math.min(10, impactMax));
  const safeLikelihood = Math.max(1, Math.min(maxL, likelihood));
  const safeImpact = Math.max(1, Math.min(maxI, impact));
  const impactValues = Array.from({ length: maxI }, (_, i) => maxI - i);
  const likelihoodValues = Array.from({ length: maxL }, (_, i) => i + 1);
  const bandConfig = { simpleBands: config.simpleBands ?? DEFAULT_RISK_ENGINE_CONFIG.simpleBands };

  return (
    <div className="mx-auto w-full max-w-[220px]">
      <div className="mb-2 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
        <span>Low likelihood</span>
        <span>High likelihood</span>
      </div>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${maxL}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`Risk matrix: likelihood ${safeLikelihood}, impact ${safeImpact}`}
      >
        {impactValues.flatMap((impactValue) =>
          likelihoodValues.map((likelihoodValue) => {
            const score = impactValue * likelihoodValue;
            const selected = impactValue === safeImpact && likelihoodValue === safeLikelihood;
            const band = getRiskLevel(score, bandConfig);
            const fill = simpleRiskMatrixFill(band, bandConfig);
            return (
              <div
                key={`${impactValue}-${likelihoodValue}`}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md text-[10px] font-bold transition-transform",
                  fill,
                  selected
                    ? "relative z-10 scale-110 text-white shadow-md ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900"
                    : "text-slate-800/45"
                )}
              >
                {selected ? score : ""}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Compare a numeric monitoring value with its threshold without inventing history. */
export function ThresholdVisual({ current, threshold, unit }: { current: number; threshold: number; unit?: string }) {
  const max = Math.max(Math.abs(current), Math.abs(threshold), 1);
  const currentPct = Math.min(100, (Math.abs(current) / max) * 100);
  const thresholdPct = Math.min(100, (Math.abs(threshold) / max) * 100);
  return (
    <div className="space-y-3">
      <MetricBar label="Current" value={current} percent={currentPct} unit={unit} tone={current >= threshold ? "rose" : "sky"} />
      <MetricBar label="Threshold" value={threshold} percent={thresholdPct} unit={unit} tone="amber" />
    </div>
  );
}

function MetricBar({
  label,
  value,
  percent,
  unit,
  tone,
}: {
  label: string;
  value: number;
  percent: number;
  unit?: string;
  tone: "rose" | "sky" | "amber";
}) {
  const fill = { rose: "bg-rose-500", sky: "bg-sky-500", amber: "bg-amber-500" }[tone];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="font-medium text-slate-600 dark:text-white/70">{label}</span>
        <span className="font-bold text-slate-800 dark:text-white">
          {value}
          {unit ?? ""}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <div className={cn("h-full rounded-full", fill)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
