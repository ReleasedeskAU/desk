"use client";

import { use, useEffect, useState } from "react";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { safeFetchJson } from "@/lib/safe-fetch";
import { cn, formatDateTime } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";
import { Package } from "lucide-react";

type IncidentDetail = {
  id: string;
  incidentCode: string;
  timestamp: string;
  departmentName: string | null;
  severity: string;
  title: string;
  status: string;
  impact: string;
  assignedTo: string | null;
  relatedReleaseCode: string | null;
  environmentName: string;
  application: { id: string; name: string };
  relatedRelease: { id: string; releaseCode: string; name: string; status: string } | null;
};

const SEVERITY_CLASSES: Record<string, string> = {
  Critical: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
  P1: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
  High: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  P2: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  Medium: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  P3: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  Low: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/70",
};

export default function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [row, setRow] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<IncidentDetail>(`/api/incidents/${id}`, {
        signal: ac.signal,
        label: "incident-detail",
        rejectHttpErrors: false,
      });
      if (ac.signal.aborted) return;
      setRow(result.ok && result.status < 300 ? result.data : null);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading incident…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Incident not found.</p>;

  return (
    <DetailPageShell
      entityCode={row.incidentCode}
      title={`${row.incidentCode} — ${row.title}`}
      subtitle={`${row.application.name} · ${row.environmentName} · ${row.severity}`}
      backHref="/incidents"
      backLabel="Back to Incidents"
      badges={
        <>
          <StatusBadge status={row.status} />
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-bold", SEVERITY_CLASSES[row.severity] ?? "")}>
            {row.severity}
          </span>
        </>
      }
      actions={
        row.relatedRelease ? (
          <ProgressLink href={`/releases/${row.relatedRelease.id}`} className={taBtnSecondary + " text-sm !py-2"}>
            <Package className="h-4 w-4 inline mr-1" /> {row.relatedRelease.releaseCode}
          </ProgressLink>
        ) : undefined
      }
    >
      <AdvancedCard title="Overview">
        <DetailFieldGrid>
          <DetailField label="Incident ID" value={row.incidentCode} />
          <DetailField label="Timestamp" value={formatDateTime(row.timestamp)} />
          <DetailField label="Title" value={row.title} />
          <DetailField label="Severity" value={row.severity} />
          <DetailField label="Status" value={row.status} />
          <DetailField label="Impact" value={row.impact} />
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

      <AdvancedCard title="Linked Release">
        <DetailFieldGrid>
          <DetailField
            label="Related Release"
            value={
              row.relatedRelease ? (
                <ProgressLink
                  href={`/releases/${row.relatedRelease.id}`}
                  className="text-brand-600 hover:underline dark:text-brand-400"
                >
                  {row.relatedRelease.releaseCode} — {row.relatedRelease.name}
                </ProgressLink>
              ) : (
                row.relatedReleaseCode || "—"
              )
            }
          />
        </DetailFieldGrid>
      </AdvancedCard>
    </DetailPageShell>
  );
}
