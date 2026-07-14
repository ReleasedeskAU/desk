"use client";

import {
  Calendar,
  Check,
  ClipboardCheck,
  GitBranch,
  Rocket,
  Settings2,
  TestTube2,
} from "lucide-react";
import { AdvancedCard } from "@/components/ui/advanced-card";
import type { LifecycleStageView } from "@/lib/types";
import { cn } from "@/lib/utils";

const icons: Record<string, typeof GitBranch> = {
  planning: GitBranch,
  scheduling: Calendar,
  testing: TestTube2,
  preparing: ClipboardCheck,
  managing: Settings2,
  deployment: Rocket,
};

const statusStyles: Record<string, { circle: string; line: string; text: string }> = {
  complete: {
    circle: "bg-emerald-500 text-white border-emerald-500",
    line: "bg-emerald-300 dark:bg-emerald-600",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  active: {
    circle: "bg-brand-500 text-white border-brand-500 ring-4 ring-brand-500/20 dark:ring-brand-500/30",
    line: "bg-brand-300 dark:bg-brand-600",
    text: "text-brand-600 dark:text-brand-400",
  },
  pending: {
    circle: "bg-gray-100 text-gray-400 border-gray-200 dark:bg-[var(--card)] dark:text-white/40 dark:border-[var(--border)]",
    line: "bg-gray-200 dark:bg-gray-700",
    text: "text-gray-400 dark:text-white/45",
  },
  blocked: {
    circle: "bg-error-500 text-white border-error-500",
    line: "bg-error-200 dark:bg-error-700",
    text: "text-error-600 dark:text-error-400",
  },
};

function StageIcon({ stage }: { stage: LifecycleStageView }) {
  const Icon = icons[stage.id] ?? GitBranch;
  const s = statusStyles[stage.status];
  return (
    <div
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[3px] shadow-sm transition-all",
        s.circle,
        stage.status === "active" && "animate-pulse ring-4 ring-brand-100 dark:ring-brand-500/20"
      )}
    >
      {stage.status === "complete" ? (
        <Check className="h-5 w-5 shrink-0" strokeWidth={3} />
      ) : (
        <Icon className="h-5 w-5 shrink-0" />
      )}
    </div>
  );
}

type ReleaseLifecycleStripProps = {
  stages: LifecycleStageView[];
  /** Render only the visualization when a parent detail section already supplies the card chrome. */
  embedded?: boolean;
};

/** Visualize the release's progress from planning through deployment. */
export function ReleaseLifecycleStrip({ stages, embedded = false }: ReleaseLifecycleStripProps) {
  const content = (
    <>
      {/* Mobile: vertical stepper — no forced 700px scroll */}
      <ol className="space-y-0 md:hidden">
        {stages.map((stage, idx) => {
          const s = statusStyles[stage.status];
          const isLast = idx === stages.length - 1;
          return (
            <li key={stage.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StageIcon stage={stage} />
                {!isLast && (
                  <div
                    className={cn(
                      "my-1 w-1 flex-1 min-h-[20px] rounded-full",
                      s.line,
                      stage.status === "pending" && "bg-gray-200 dark:bg-gray-700"
                    )}
                  />
                )}
              </div>
              <div className={cn("min-w-0 pb-4", isLast && "pb-0")}>
                <p className={cn("text-xs font-bold uppercase tracking-wider", s.text)}>{stage.label}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-gray-500 dark:text-white/50">{stage.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Desktop: horizontal strip */}
      <div className="hidden overflow-x-auto md:block">
        <div className="flex w-full min-w-[700px] items-center px-8 pb-20 pt-6">
          {stages.map((stage, idx) => {
            const s = statusStyles[stage.status];
            const isLast = idx === stages.length - 1;

            return (
              <div key={stage.id} className={cn("relative flex items-center", isLast ? "flex-none" : "flex-1")}>
                <div className="relative z-10 flex flex-col items-center">
                  <StageIcon stage={stage} />
                  <div className="absolute left-1/2 top-14 w-36 -translate-x-1/2 text-center">
                    <p className={cn("mb-1 text-xs font-bold uppercase tracking-wider", s.text)}>{stage.label}</p>
                    <p className="text-[11px] leading-snug text-gray-500 dark:text-white/50">{stage.detail}</p>
                  </div>
                </div>

                {!isLast && (
                  <div
                    className={cn(
                      "z-0 h-1 flex-1",
                      s.line,
                      stage.status === "pending" && "bg-gray-200 dark:bg-gray-700"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  if (embedded) {
    return <div className="px-1 md:px-2">{content}</div>;
  }

  return (
    <AdvancedCard title="Release Lifecycle" variant="glass" innerClassName="p-4 md:p-6">
      {content}
    </AdvancedCard>
  );
}
