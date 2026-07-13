"use client";

import { use, useEffect, useState } from "react";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";
import { Package } from "lucide-react";

type ApprovalDetail = {
  id: string;
  approvalCode: string;
  applicationName: string | null;
  departmentName: string | null;
  approvalType: string;
  submittedDate: string;
  decisionDate: string | null;
  decision: string;
  comments: string | null;
  cabMeetingId: string | null;
  release: { id: string; releaseCode: string; name: string; status: string; releaseDate: string };
  approver: { id: string; userId: string; name: string; email: string; role: string };
};

export default function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [row, setRow] = useState<ApprovalDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<ApprovalDetail>(`/api/approvals/${id}`, {
        signal: ac.signal,
        label: "approval-detail",
        rejectHttpErrors: false,
      });
      if (ac.signal.aborted) return;
      setRow(result.ok && result.status < 300 ? result.data : null);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading approval…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Approval not found.</p>;

  return (
    <DetailPageShell
      entityCode={row.approvalCode}
      title={`${row.approvalCode} — Approval`}
      subtitle={`${row.approvalType} · ${row.release.releaseCode} · ${row.approver.name}`}
      backHref="/approvals"
      backLabel="Back to Approval Queue"
      badges={<StatusBadge status={row.decision} />}
      actions={
        <ProgressLink href={`/releases/${row.release.id}`} className={taBtnSecondary + " text-sm !py-2"}>
          <Package className="h-4 w-4 inline mr-1" /> {row.release.releaseCode}
        </ProgressLink>
      }
    >
      <AdvancedCard title="Overview">
        <DetailFieldGrid>
          <DetailField label="Approval ID" value={row.approvalCode} />
          <DetailField label="Approval Type" value={row.approvalType} />
          <DetailField label="Decision" value={row.decision} />
          <DetailField label="Submitted Date" value={formatDate(row.submittedDate)} />
          <DetailField label="Decision Date" value={row.decisionDate ? formatDate(row.decisionDate) : "—"} />
          <DetailField label="CAB Meeting ID" value={row.cabMeetingId ?? "—"} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Release context">
        <DetailFieldGrid>
          <DetailField
            label="Release ID"
            value={
              <ProgressLink href={`/releases/${row.release.id}`} className="text-brand-600 hover:underline dark:text-brand-400">
                {row.release.releaseCode}
              </ProgressLink>
            }
          />
          <DetailField label="Release Name" value={row.release.name} />
          <DetailField label="Application" value={row.applicationName ?? "—"} />
          <DetailField label="Department" value={row.departmentName ?? "—"} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Approver">
        <DetailFieldGrid>
          <DetailField label="Approver ID" value={row.approver.userId} />
          <DetailField label="Approver Name" value={row.approver.name} />
          <DetailField label="Approver Role" value={row.approver.role} />
        </DetailFieldGrid>
        {row.comments ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-white/75 border-t border-gray-100 dark:border-[var(--border)] pt-3">
            {row.comments}
          </p>
        ) : null}
      </AdvancedCard>
    </DetailPageShell>
  );
}
