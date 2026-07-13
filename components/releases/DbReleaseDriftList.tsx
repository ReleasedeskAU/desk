"use client";

import { useEffect, useState } from "react";
import { GitCompareArrows } from "lucide-react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { cn, formatDate } from "@/lib/utils";
import { loadJsonEffect } from "@/lib/safe-fetch";

type LiveDrift = {
  id: string;
  driftCode: string;
  environmentName: string;
  driftType: string;
  severity: string;
  description: string;
  status: string;
  detectedDate: string;
  impactOnRelease: string | null;
  application: { id: string; name: string };
};

const SEVERITY_CLASSES: Record<string, string> = {
  Critical: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
  High: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  Medium: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  Low: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/70",
};

type Props = {
  releaseId: string;
  embedded?: boolean;
};

export function DbReleaseDriftList({ releaseId, embedded = false }: Props) {
  const [drifts, setDrifts] = useState<LiveDrift[] | null>(null);

  useEffect(() => {
    return loadJsonEffect<LiveDrift[]>(
      `/api/drifts?release=${encodeURIComponent(releaseId)}`,
      setDrifts,
      { label: "release-live-drifts" }
    );
  }, [releaseId]);

  const body =
    drifts == null ? (
      <p className="text-sm text-gray-500 dark:text-white/55">Loading drift…</p>
    ) : drifts.length === 0 ? (
      <p className="text-sm text-emerald-600 dark:text-emerald-400">No drift records for this release.</p>
    ) : (
      <ul className="space-y-2">
        {drifts.map((d) => (
          <li
            key={d.id}
            className="rounded-lg bg-gray-50/80 dark:bg-white/5 px-3 py-2.5 space-y-1.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <ProgressLink
                href={`/drifts/${d.id}`}
                className="font-mono text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                {d.driftCode}
              </ProgressLink>
              <span
                className={cn(
                  "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  SEVERITY_CLASSES[d.severity] ?? ""
                )}
              >
                {d.severity}
              </span>
              <StatusBadge status={d.status} />
              <span className="text-[10px] text-gray-500 dark:text-white/50">{d.driftType}</span>
            </div>
            <p className="text-sm text-gray-700 dark:text-white/80">{d.description}</p>
            <p className="text-xs text-gray-500 dark:text-white/50">
              {d.application.name} · {d.environmentName} · Detected {formatDate(d.detectedDate)}
              {d.impactOnRelease ? ` · Impact: ${d.impactOnRelease}` : ""}
            </p>
          </li>
        ))}
      </ul>
    );

  if (embedded) return body;

  return (
    <AdvancedCard
      title="Drift"
      subtitle="Live environment / config drift for this release"
      icon={GitCompareArrows}
      variant="glass"
    >
      {body}
    </AdvancedCard>
  );
}
