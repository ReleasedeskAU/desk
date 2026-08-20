"use client";

import { useCallback, useEffect, useState } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { IncidentFormModal } from "@/components/incidents/IncidentFormModal";
import { ReleaseRelatedListFrame } from "@/components/releases/ReleaseRelatedListFrame";
import { loadJsonEffect } from "@/lib/safe-fetch";

type LiveIncident = {
  id: string;
  incidentCode: string;
  title: string;
  severity: string;
  status: string;
  impact: string;
  relatedReleaseCode: string | null;
};

type Props = {
  releaseCode: string;
  preferredApplicationId?: string;
  canEdit?: boolean;
};

/**
 * Incidents linked by `relatedReleaseCode`, plus Add (same Incident row).
 */
export function DbReleaseIncidentList({
  releaseCode,
  preferredApplicationId,
  canEdit = false,
}: Props) {
  const [rows, setRows] = useState<LiveIncident[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    return loadJsonEffect<LiveIncident[]>(
      `/api/incidents?relatedRelease=${encodeURIComponent(releaseCode)}`,
      (data) =>
        setRows(
          data.filter(
            (row) =>
              (row.relatedReleaseCode ?? "").toLowerCase() === releaseCode.toLowerCase()
          )
        ),
      { label: "release-live-incidents" }
    );
  }, [releaseCode, reloadKey]);

  return (
    <>
      <ReleaseRelatedListFrame
        heading="Linked incidents"
        addLabel="Add Incident"
        canEdit={canEdit}
        onAdd={() => setModalOpen(true)}
        loading={rows == null}
        loadingLabel="Loading incidents…"
        emptyLabel="No incidents linked"
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
                  href={`/incidents/${row.id}`}
                  className="font-mono text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                >
                  {row.incidentCode}
                </ProgressLink>
                <StatusBadge status={row.status} />
                <span className="text-[10px] text-gray-500 dark:text-white/50">{row.severity}</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-white/80">{row.title}</p>
              <p className="text-xs text-gray-500 dark:text-white/50">Impact: {row.impact}</p>
            </li>
          ))}
        </ul>
      </ReleaseRelatedListFrame>
      <IncidentFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={reload}
        lockRelatedReleaseCode={releaseCode}
        preferredApplicationId={preferredApplicationId}
      />
    </>
  );
}
