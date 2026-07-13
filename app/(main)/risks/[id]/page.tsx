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

type RiskDetail = {
  id: string;
  riskCode: string;
  applicationName: string | null;
  departmentName: string | null;
  category: string;
  description: string;
  likelihood: number;
  impact: number;
  riskScore: number;
  affectedArea: string | null;
  mitigationStrategy: string | null;
  status: string;
  notes: string | null;
  release: { id: string; releaseCode: string; name: string; status: string; releaseDate: string };
  riskOwner: { id: string; userId: string; name: string; email: string } | null;
};

export default function RiskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [row, setRow] = useState<RiskDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<RiskDetail>(`/api/risks/${id}`, {
        signal: ac.signal,
        label: "risk-detail",
        rejectHttpErrors: false,
      });
      if (ac.signal.aborted) return;
      setRow(result.ok && result.status < 300 ? result.data : null);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading risk…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Risk not found.</p>;

  return (
    <DetailPageShell
      entityCode={row.riskCode}
      title={`${row.riskCode} — Risk`}
      subtitle={`${row.category} · Score ${row.riskScore} · ${row.release.releaseCode}`}
      backHref="/risks"
      backLabel="Back to Risk"
      badges={<StatusBadge status={row.status} />}
      actions={
        <ProgressLink href={`/releases/${row.release.id}`} className={taBtnSecondary + " text-sm !py-2"}>
          <Package className="h-4 w-4 inline mr-1" /> {row.release.releaseCode}
        </ProgressLink>
      }
    >
      <AdvancedCard title="Overview">
        <DetailFieldGrid>
          <DetailField label="Risk ID" value={row.riskCode} />
          <DetailField label="Status" value={row.status} />
          <DetailField label="Risk Category" value={row.category} />
          <DetailField label="Risk Score" value={row.riskScore} />
          <DetailField label="Likelihood" value={row.likelihood} />
          <DetailField label="Impact" value={row.impact} />
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
          <DetailField label="Prod Date" value={formatDate(row.release.releaseDate)} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Description & mitigation">
        <DetailFieldGrid>
          <DetailField label="Risk Description" value={row.description} />
          <DetailField label="Affected Area" value={row.affectedArea ?? "—"} />
          <DetailField label="Mitigation Strategy" value={row.mitigationStrategy ?? "—"} />
          <DetailField
            label="Risk Owner"
            value={row.riskOwner ? `${row.riskOwner.name} (${row.riskOwner.userId})` : "—"}
          />
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
