"use client";

import { use, useEffect, useState } from "react";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { safeFetchJson } from "@/lib/safe-fetch";
import { cn, formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";
import { Package } from "lucide-react";

type DriftDetail = {
  id: string;
  driftCode: string;
  departmentName: string | null;
  environmentName: string;
  driftType: string;
  driftCategory: string | null;
  detectedDate: string;
  severity: string;
  description: string;
  impactOnRelease: string | null;
  remediationAction: string | null;
  status: string;
  etaToFix: string | null;
  release: { id: string; releaseCode: string; name: string; status: string };
  application: { id: string; name: string };
};

const SEVERITY_CLASSES: Record<string, string> = {
  Critical: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
  High: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  Medium: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  Low: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/70",
};

export default function DriftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [row, setRow] = useState<DriftDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<DriftDetail>(`/api/drifts/${id}`, {
        signal: ac.signal,
        label: "drift-detail",
        rejectHttpErrors: false,
      });
      if (ac.signal.aborted) return;
      setRow(result.ok && result.status < 300 ? result.data : null);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading drift…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Drift not found.</p>;

  return (
    <DetailPageShell
      entityCode={row.driftCode}
      title={`${row.driftCode} — Drift`}
      subtitle={`${row.application.name} · ${row.environmentName} · ${row.release.releaseCode}`}
      backHref="/drifts"
      backLabel="Back to Drift Dashboard"
      badges={
        <>
          <StatusBadge status={row.status} />
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-bold", SEVERITY_CLASSES[row.severity] ?? "")}>
            {row.severity}
          </span>
        </>
      }
      actions={
        <ProgressLink href={`/releases/${row.release.id}`} className={taBtnSecondary + " text-sm !py-2"}>
          <Package className="h-4 w-4 inline mr-1" /> {row.release.releaseCode}
        </ProgressLink>
      }
    >
      <AdvancedCard title="Overview">
        <DetailFieldGrid>
          <DetailField label="Drift ID" value={row.driftCode} />
          <DetailField label="Status" value={row.status} />
          <DetailField label="Severity" value={row.severity} />
          <DetailField label="Drift Type" value={row.driftType} />
          <DetailField label="Drift Category" value={row.driftCategory ?? "—"} />
          <DetailField label="Detected Date" value={formatDate(row.detectedDate)} />
          <DetailField label="ETA to Fix" value={row.etaToFix ? formatDate(row.etaToFix) : "—"} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Scope">
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
          <DetailField label="Application" value={row.application.name} />
          <DetailField label="Department" value={row.departmentName ?? "—"} />
          <DetailField label="Environment" value={row.environmentName} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Impact & remediation">
        <DetailFieldGrid>
          <DetailField label="Description" value={row.description} />
          <DetailField label="Impact on Release" value={row.impactOnRelease ?? "—"} />
          <DetailField label="Remediation Action" value={row.remediationAction ?? "—"} />
        </DetailFieldGrid>
      </AdvancedCard>
    </DetailPageShell>
  );
}
