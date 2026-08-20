"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { BlockerFormModal } from "@/components/releases/BlockerFormModal";
import { taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { loadJsonEffect } from "@/lib/safe-fetch";

type LiveBlocker = {
  id: string;
  blockerCode: string;
  blockerType: string;
  blockerDescription: string;
  severity: string;
  status: string;
  assignedTo: string;
  impactOnRelease: string;
  daysOpen: number;
  escalationLevel: string;
};

const SEVERITY_CLASSES: Record<string, string> = {
  Critical: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
  High: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  Medium: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  Low: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/70",
};

type Props = {
  releaseCode: string;
  releaseName: string;
  departmentName: string;
  applicationName: string;
  canEdit?: boolean;
  raisedByDefault?: string;
  onChanged?: () => void;
  /** When true, render list only (parent supplies section chrome). */
  embedded?: boolean;
  /** Reports open blocker count for dashboard tile KPIs. */
  onCountChange?: (count: number, topSeverity: string | null) => void;
  /** VR-35: disable add when parent is Deploying or later. */
  addDisabledReason?: string | null;
};

export function DbBlockerList({
  releaseCode,
  releaseName,
  departmentName,
  applicationName,
  canEdit = false,
  raisedByDefault = "",
  onChanged,
  embedded = false,
  onCountChange,
  addDisabledReason = null,
}: Props) {
  const [blockers, setBlockers] = useState<LiveBlocker[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
    onChanged?.();
  }, [onChanged]);

  useEffect(() => {
    return loadJsonEffect<LiveBlocker[]>(
      `/api/blockers?release=${encodeURIComponent(releaseCode)}`,
      (rows) => {
        setBlockers(rows);
        const open = rows.filter(
          (b) => !["resolved", "closed", "done", "mitigated", "cancelled", "canceled"].includes(b.status.toLowerCase())
        );
        const severityRank = ["Critical", "High", "Medium", "Low"];
        const top =
          open
            .map((b) => b.severity)
            .sort((a, b) => severityRank.indexOf(a) - severityRank.indexOf(b))[0] ?? null;
        const notify = onCountChange;
        if (notify) queueMicrotask(() => notify(open.length, top));
      },
      { label: "release-live-blockers" }
    );
  }, [onCountChange, releaseCode, reloadKey]);

  const addButton = canEdit ? (
    <button
      type="button"
      className={taBtnSecondary + " text-xs !py-1.5"}
      onClick={() => setModalOpen(true)}
      disabled={Boolean(addDisabledReason)}
      title={addDisabledReason ?? undefined}
    >
      <Plus className="h-3.5 w-3.5 inline mr-1" />
      Add Blocker
    </button>
  ) : null;

  const body =
    blockers == null ? (
      <p className="text-sm text-gray-500 dark:text-white/55">Loading blockers…</p>
    ) : blockers.length === 0 ? (
      <p className="text-sm text-emerald-600 dark:text-emerald-400">No blockers — release looks clear.</p>
    ) : (
      <ul className="space-y-2">
        {blockers.map((b) => (
          <li
            key={b.id}
            className="rounded-lg bg-warning-50/50 dark:bg-warning-500/10 px-3 py-2.5 space-y-1.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <ProgressLink
                href={`/blockers/${b.id}`}
                className="font-mono text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                {b.blockerCode}
              </ProgressLink>
              <span
                className={cn(
                  "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  SEVERITY_CLASSES[b.severity] ?? ""
                )}
              >
                {b.severity}
              </span>
              <StatusBadge status={b.status} />
              <span className="text-[10px] text-gray-500 dark:text-white/50">{b.blockerType}</span>
            </div>
            <p className="text-sm text-gray-700 dark:text-white/80 pl-6">{b.blockerDescription}</p>
            <p className="text-xs text-gray-500 dark:text-white/50 pl-6">
              Impact: {b.impactOnRelease}
              {b.assignedTo ? ` · Assigned: ${b.assignedTo}` : ""}
              {` · ${b.daysOpen}d open · ${b.escalationLevel}`}
            </p>
          </li>
        ))}
      </ul>
    );

  return (
    <>
      {embedded ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-gray-500 dark:text-white/55 uppercase tracking-wide">
              Active Blockers
            </p>
            {addButton}
          </div>
          {addDisabledReason ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">{addDisabledReason}</p>
          ) : null}
          {body}
        </div>
      ) : (
        <AdvancedCard
          title="Blockers"
          subtitle="Live records from the Blockers register"
          icon={AlertTriangle}
          variant="glass"
          action={addButton ?? undefined}
        >
          {body}
        </AdvancedCard>
      )}

      <BlockerFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={reload}
        releaseCode={releaseCode}
        releaseName={releaseName}
        departmentName={departmentName}
        applicationName={applicationName}
        raisedByDefault={raisedByDefault}
      />
    </>
  );
}
