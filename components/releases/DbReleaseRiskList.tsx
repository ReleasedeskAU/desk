"use client";

import { useCallback, useEffect, useState } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { RiskFormModal } from "@/components/risks/RiskFormModal";
import { ReleaseRelatedListFrame } from "@/components/releases/ReleaseRelatedListFrame";
import { loadJsonEffect } from "@/lib/safe-fetch";

const RISK_CATEGORY_OPTIONS = [
  "Technical",
  "Operational",
  "Security",
  "Compliance",
  "Vendor",
  "Schedule",
];

type LiveRisk = {
  id: string;
  riskCode: string;
  description: string;
  category: string;
  status: string;
  riskScore: number;
  likelihood: number;
  impact: number;
};

type Props = {
  releaseId: string;
  departmentId: string;
  applicationId: string;
  canEdit?: boolean;
};

/**
 * Risks linked to this release (`Risk.releaseId`) plus Add.
 */
export function DbReleaseRiskList({
  releaseId,
  departmentId,
  applicationId,
  canEdit = false,
}: Props) {
  const [rows, setRows] = useState<LiveRisk[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    return loadJsonEffect<LiveRisk[]>(
      `/api/risks?release=${encodeURIComponent(releaseId)}`,
      setRows,
      { label: "release-live-risks" }
    );
  }, [releaseId, reloadKey]);

  return (
    <>
      <ReleaseRelatedListFrame
        heading="Linked risks"
        addLabel="Add Risk"
        canEdit={canEdit}
        onAdd={() => setModalOpen(true)}
        loading={rows == null}
        loadingLabel="Loading risks…"
        emptyLabel="No risks linked"
        hasItems={Boolean(rows?.length)}
      >
        <ul className="space-y-2">
          {(rows ?? []).map((row) => (
            <li
              key={row.id}
              className="space-y-1.5 rounded-lg bg-gray-50/80 px-3 py-2.5 dark:bg-white/5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <ProgressLink
                  href={`/risks/${row.id}`}
                  className="font-mono text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                >
                  {row.riskCode}
                </ProgressLink>
                <StatusBadge status={row.status} />
                <span className="text-[10px] text-gray-500 dark:text-white/50">{row.category}</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-white/80">{row.description}</p>
              <p className="text-xs text-gray-500 dark:text-white/50">
                Score {row.riskScore} ({row.likelihood} × {row.impact})
              </p>
            </li>
          ))}
        </ul>
      </ReleaseRelatedListFrame>
      <RiskFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={reload}
        categoryOptions={RISK_CATEGORY_OPTIONS}
        lockTo={
          departmentId && applicationId
            ? { releaseId, departmentId, applicationId }
            : null
        }
      />
    </>
  );
}
