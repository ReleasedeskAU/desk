"use client";

import { use, useEffect, useState } from "react";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { safeFetchJson } from "@/lib/safe-fetch";
import { cn, formatDateTime } from "@/lib/utils";

type AlertDetail = {
  id: string;
  alertCode: string;
  timestamp: string;
  departmentName: string | null;
  alertType: string;
  severity: string;
  metric: string;
  threshold: string | null;
  currentValue: string | null;
  status: string;
  assignedTo: string | null;
  environmentName: string;
  application: { id: string; name: string };
};

const SEVERITY_CLASSES: Record<string, string> = {
  Critical: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
  High: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  Warning: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  Medium: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  Info: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300",
  Low: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/70",
};

export default function MonitoringAlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [row, setRow] = useState<AlertDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<AlertDetail>(`/api/monitoring-alerts/${id}`, {
        signal: ac.signal,
        label: "alert-detail",
        rejectHttpErrors: false,
      });
      if (ac.signal.aborted) return;
      setRow(result.ok && result.status < 300 ? result.data : null);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading alert…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Alert not found.</p>;

  return (
    <DetailPageShell
      entityCode={row.alertCode}
      title={`${row.alertCode} — Alert`}
      subtitle={`${row.application.name} · ${row.environmentName} · ${row.alertType}`}
      backHref="/monitoring-alerts"
      backLabel="Back to Monitoring Alerts"
      badges={
        <>
          <StatusBadge status={row.status} />
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-bold", SEVERITY_CLASSES[row.severity] ?? "")}>
            {row.severity}
          </span>
        </>
      }
    >
      <AdvancedCard title="Overview">
        <DetailFieldGrid>
          <DetailField label="Alert ID" value={row.alertCode} />
          <DetailField label="Timestamp" value={formatDateTime(row.timestamp)} />
          <DetailField label="Alert Type" value={row.alertType} />
          <DetailField label="Severity" value={row.severity} />
          <DetailField label="Status" value={row.status} />
          <DetailField label="Assigned To" value={row.assignedTo || "—"} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Scope">
        <DetailFieldGrid>
          <DetailField label="Application" value={row.application.name} />
          <DetailField label="Department" value={row.departmentName ?? "—"} />
          <DetailField label="Environment" value={row.environmentName} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Metric">
        <DetailFieldGrid>
          <DetailField label="Metric" value={row.metric} />
          <DetailField label="Threshold" value={row.threshold ?? "—"} />
          <DetailField label="Current Value" value={row.currentValue ?? "—"} />
        </DetailFieldGrid>
      </AdvancedCard>
    </DetailPageShell>
  );
}
