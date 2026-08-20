"use client";

import { useCallback, useEffect, useState } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ApprovalCreateModal } from "@/components/approvals/ApprovalCreateModal";
import { ReleaseRelatedListFrame } from "@/components/releases/ReleaseRelatedListFrame";
import { loadJsonEffect } from "@/lib/safe-fetch";

type LiveApproval = {
  id: string;
  approvalCode: string;
  approvalType: string;
  decision: string;
  approver?: { name: string; userId: string } | null;
};

type Props = {
  releaseId: string;
  canEdit?: boolean;
};

/**
 * Approval rows for this release, plus create (same Approval Queue record).
 */
export function DbReleaseApprovalList({ releaseId, canEdit = false }: Props) {
  const [rows, setRows] = useState<LiveApproval[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    return loadJsonEffect<LiveApproval[]>(
      `/api/approvals?release=${encodeURIComponent(releaseId)}`,
      setRows,
      { label: "release-live-approvals" }
    );
  }, [releaseId, reloadKey]);

  return (
    <>
      <ReleaseRelatedListFrame
        heading="Approval requests"
        addLabel="Add Approval"
        canEdit={canEdit}
        onAdd={() => setModalOpen(true)}
        loading={rows == null}
        loadingLabel="Loading approvals…"
        emptyLabel="No approval requests"
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
                  href={`/approvals/${row.id}`}
                  className="font-mono text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                >
                  {row.approvalCode}
                </ProgressLink>
                <StatusBadge status={row.decision} />
                <span className="text-[10px] text-gray-500 dark:text-white/50">
                  {row.approvalType}
                </span>
              </div>
              {row.approver ? (
                <p className="text-xs text-gray-500 dark:text-white/50">
                  Approver: {row.approver.userId} — {row.approver.name}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </ReleaseRelatedListFrame>
      <ApprovalCreateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={reload}
        lockReleaseId={releaseId}
      />
    </>
  );
}
