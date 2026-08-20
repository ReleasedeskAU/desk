"use client";

import { useCallback, useEffect, useState } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { DependencyFormModal } from "@/components/dependencies/DependencyFormModal";
import { ReleaseRelatedListFrame } from "@/components/releases/ReleaseRelatedListFrame";
import { loadJsonEffect } from "@/lib/safe-fetch";

type LiveDependency = {
  id: string;
  depCode: string;
  releaseCode: string;
  releaseName: string;
  releaseDbId: string;
  dependsOnCode: string;
  dependsOnName: string;
  dependsOnDbId: string;
  dependencyType: string;
  status: string;
  impactIfBlocked: string;
};

type Props = {
  releaseId: string;
  releaseCode: string;
  canEdit?: boolean;
  addDisabledReason?: string | null;
};

/**
 * Dependencies where this release is either side of the link, plus Add (VR-36).
 */
export function DbReleaseDependencyList({
  releaseId,
  releaseCode,
  canEdit = false,
  addDisabledReason = null,
}: Props) {
  const [rows, setRows] = useState<LiveDependency[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    return loadJsonEffect<LiveDependency[]>(
      `/api/dependencies?linked=${encodeURIComponent(releaseCode)}`,
      setRows,
      { label: "release-live-dependencies" }
    );
  }, [releaseCode, reloadKey]);

  return (
    <>
      <ReleaseRelatedListFrame
        heading="Linked dependencies"
        addLabel="Add Dependency"
        canEdit={canEdit}
        addDisabledReason={addDisabledReason}
        onAdd={() => setModalOpen(true)}
        loading={rows == null}
        loadingLabel="Loading dependencies…"
        emptyLabel="No dependencies linked"
        hasItems={Boolean(rows?.length)}
      >
        <ul className="space-y-2">
          {(rows ?? []).map((row) => {
            const isDepender = row.releaseDbId === releaseId || row.releaseCode === releaseCode;
            const otherCode = isDepender ? row.dependsOnCode : row.releaseCode;
            const otherName = isDepender ? row.dependsOnName : row.releaseName;
            const otherId = isDepender ? row.dependsOnDbId : row.releaseDbId;
            return (
              <li
                key={row.id}
                className="space-y-1.5 rounded-lg bg-gray-50/80 px-3 py-2.5 dark:bg-white/5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ProgressLink
                    href={`/dependencies/${row.id}`}
                    className="font-mono text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {row.depCode || "DEP"}
                  </ProgressLink>
                  <StatusBadge status={row.status} />
                  <span className="text-[10px] text-gray-500 dark:text-white/50">
                    {row.dependencyType}
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    {isDepender ? "Depends on" : "Depended on by"}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-white/80">
                  {otherId ? (
                    <ProgressLink
                      href={`/releases/${otherId}`}
                      className="font-mono text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {otherCode}
                    </ProgressLink>
                  ) : (
                    <span className="font-mono text-xs">{otherCode}</span>
                  )}
                  {otherName ? <span> — {otherName}</span> : null}
                </p>
                {row.impactIfBlocked ? (
                  <p className="text-xs text-gray-500 dark:text-white/50">
                    Impact if blocked: {row.impactIfBlocked}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </ReleaseRelatedListFrame>
      <DependencyFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={reload}
        lockReleaseId={releaseId}
      />
    </>
  );
}
