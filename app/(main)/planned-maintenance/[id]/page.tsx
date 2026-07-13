"use client";

import { use, useEffect, useState } from "react";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";

type MaintenanceDetail = {
  id: string;
  maintenanceCode: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  type: string;
  environmentName: string;
  departmentName: string | null;
  impact: string;
  requestor: string | null;
  approvalStatus: string;
  notes: string | null;
  application: { id: string; name: string } | null;
};

export default function MaintenanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [row, setRow] = useState<MaintenanceDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<MaintenanceDetail>(`/api/planned-maintenance/${id}`, {
        signal: ac.signal,
        label: "maintenance-detail",
        rejectHttpErrors: false,
      });
      if (ac.signal.aborted) return;
      setRow(result.ok && result.status < 300 ? result.data : null);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading maintenance…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Maintenance not found.</p>;

  return (
    <DetailPageShell
      entityCode={row.maintenanceCode}
      title={`${row.maintenanceCode} — Maintenance`}
      subtitle={`${row.type} · ${formatDate(row.scheduledDate)} · ${row.application?.name ?? "Unscoped"}`}
      backHref="/planned-maintenance"
      backLabel="Back to Planned Maintenance"
      badges={<StatusBadge status={row.approvalStatus} />}
    >
      <AdvancedCard title="Schedule">
        <DetailFieldGrid>
          <DetailField label="Maintenance ID" value={row.maintenanceCode} />
          <DetailField label="Scheduled Date" value={formatDate(row.scheduledDate)} />
          <DetailField label="Start Time" value={row.startTime} />
          <DetailField label="End Time" value={row.endTime} />
          <DetailField label="Type" value={row.type} />
          <DetailField label="Approval Status" value={row.approvalStatus} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Scope">
        <DetailFieldGrid>
          <DetailField label="Application(s)" value={row.application?.name ?? "—"} />
          <DetailField label="Environment(s)" value={row.environmentName} />
          <DetailField label="Department" value={row.departmentName ?? "—"} />
          <DetailField label="Impact" value={row.impact} />
          <DetailField label="Requestor" value={row.requestor || "—"} />
        </DetailFieldGrid>
        {row.notes ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-white/75 border-t border-gray-100 dark:border-[var(--border)] pt-3">
            {row.notes}
          </p>
        ) : null}
      </AdvancedCard>
    </DetailPageShell>
  );
}
