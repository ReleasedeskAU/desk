"use client";

import { useCallback, useEffect, useState } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ConflictFormModal } from "@/components/conflicts/ConflictFormModal";
import { ReleaseRelatedListFrame } from "@/components/releases/ReleaseRelatedListFrame";
import { loadJsonEffect } from "@/lib/safe-fetch";

/** Sheet types requested on the Release page, plus the three lifecycle defaults. */
const RELEASE_PAGE_CONFLICT_TYPES = [
  "Environment Booking",
  "Maintenance Window",
  "Freeze Period",
  "Schedule",
  "Resource",
  "Application",
];

type LiveConflict = {
  id: string;
  conflictCode: string;
  status: string;
  priority: string;
  release1Code: string;
  release2Code: string;
  conflictingEnvironment: string;
  environmentConflictType: string;
};

type Props = {
  releaseCode: string;
  departmentId: string;
  applicationId: string;
  canEdit?: boolean;
};

/**
 * Conflict rows involving this release, plus Add (same Conflict queue record).
 */
export function DbReleaseConflictList({
  releaseCode,
  departmentId,
  applicationId,
  canEdit = false,
}: Props) {
  const [rows, setRows] = useState<LiveConflict[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    return loadJsonEffect<LiveConflict[]>(
      `/api/conflicts?release=${encodeURIComponent(releaseCode)}`,
      setRows,
      { label: "release-live-conflicts" }
    );
  }, [releaseCode, reloadKey]);

  return (
    <>
      <ReleaseRelatedListFrame
        heading="Conflict records"
        addLabel="Add Conflict"
        canEdit={canEdit}
        onAdd={() => setModalOpen(true)}
        loading={rows == null}
        loadingLabel="Loading conflicts…"
        emptyLabel="No conflicts linked"
        hasItems={Boolean(rows?.length)}
      >
        <ul className="space-y-2">
          {(rows ?? []).map((row) => {
            const other =
              row.release1Code.toLowerCase() === releaseCode.toLowerCase()
                ? row.release2Code
                : row.release1Code;
            return (
              <li
                key={row.id}
                className="space-y-1.5 rounded-lg bg-gray-50/80 px-3 py-2.5 dark:bg-white/5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ProgressLink
                    href={`/conflicts/${row.id}`}
                    className="font-mono text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {row.conflictCode}
                  </ProgressLink>
                  <StatusBadge status={row.status} />
                  <span className="text-[10px] text-gray-500 dark:text-white/50">
                    {row.priority}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-white/50">
                    {row.environmentConflictType}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-white/80">
                  vs {other} · {row.conflictingEnvironment}
                </p>
              </li>
            );
          })}
        </ul>
      </ReleaseRelatedListFrame>
      <ConflictFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={reload}
        conflictTypeOptions={RELEASE_PAGE_CONFLICT_TYPES}
        lockRelease1Code={releaseCode}
        lockOrg={
          departmentId && applicationId ? { departmentId, applicationId } : null
        }
      />
    </>
  );
}
