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

type BlockerDetail = {
  id: string;
  blockerCode: string;
  releaseCode: string;
  releaseName: string;
  department: string;
  application: string;
  blockerType: string;
  blockerDescription: string;
  severity: string;
  raisedDate: string;
  raisedBy: string;
  assignedTo: string | null;
  status: string;
  targetResolutionDate: string | null;
  actualResolutionDate: string | null;
  daysOpen: number;
  escalationLevel: string;
  rootCause: string | null;
  resolutionNotes: string | null;
  impactOnRelease: string;
  release: { id: string; releaseCode: string; name: string; status: string } | null;
};

const SEVERITY_CLASSES: Record<string, string> = {
  Critical: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
  High: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  Medium: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  Low: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/70",
};

export default function BlockerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [row, setRow] = useState<BlockerDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<BlockerDetail>(`/api/blockers/${id}`, {
        signal: ac.signal,
        label: "blocker-detail",
        rejectHttpErrors: false,
      });
      if (ac.signal.aborted) return;
      setRow(result.ok && result.status < 300 ? result.data : null);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading blocker…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Blocker not found.</p>;

  return (
    <DetailPageShell
      entityCode={row.blockerCode}
      title={`${row.blockerCode} — Blocker`}
      subtitle={`${row.application} · ${row.blockerType} · ${row.releaseCode}`}
      backHref="/blockers"
      backLabel="Back to Blockers"
      badges={
        <>
          <StatusBadge status={row.status} />
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-bold", SEVERITY_CLASSES[row.severity] ?? "")}>
            {row.severity}
          </span>
        </>
      }
      actions={
        row.release ? (
          <ProgressLink href={`/releases/${row.release.id}`} className={taBtnSecondary + " text-sm !py-2"}>
            <Package className="h-4 w-4 inline mr-1" /> {row.release.releaseCode}
          </ProgressLink>
        ) : undefined
      }
    >
      <AdvancedCard title="Overview">
        <DetailFieldGrid>
          <DetailField label="Blocker ID" value={row.blockerCode} />
          <DetailField label="Blocker Type" value={row.blockerType} />
          <DetailField label="Severity" value={row.severity} />
          <DetailField label="Status" value={row.status} />
          <DetailField label="Escalation Level" value={row.escalationLevel} />
          <DetailField label="Days Open" value={row.daysOpen} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Release context">
        <DetailFieldGrid>
          <DetailField
            label="Release ID"
            value={
              row.release ? (
                <ProgressLink href={`/releases/${row.release.id}`} className="text-brand-600 hover:underline dark:text-brand-400">
                  {row.release.releaseCode}
                </ProgressLink>
              ) : (
                row.releaseCode
              )
            }
          />
          <DetailField label="Release Name" value={row.releaseName} />
          <DetailField label="Application" value={row.application} />
          <DetailField label="Department" value={row.department} />
          <DetailField label="Impact on Release" value={row.impactOnRelease} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Ownership & timeline">
        <DetailFieldGrid>
          <DetailField label="Raised Date" value={formatDate(row.raisedDate)} />
          <DetailField label="Raised By" value={row.raisedBy} />
          <DetailField label="Assigned To" value={row.assignedTo || "—"} />
          <DetailField
            label="Target Resolution Date"
            value={row.targetResolutionDate ? formatDate(row.targetResolutionDate) : "—"}
          />
          <DetailField
            label="Actual Resolution Date"
            value={row.actualResolutionDate ? formatDate(row.actualResolutionDate) : "—"}
          />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Description & resolution">
        <DetailFieldGrid>
          <DetailField label="Blocker Description" value={row.blockerDescription} />
          <DetailField label="Root Cause" value={row.rootCause || "—"} />
          <DetailField label="Resolution Notes" value={row.resolutionNotes || "—"} />
        </DetailFieldGrid>
      </AdvancedCard>
    </DetailPageShell>
  );
}
