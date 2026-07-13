"use client";

import { use, useEffect, useState } from "react";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { safeFetchJson } from "@/lib/safe-fetch";

type FlowDetail = {
  id: string;
  flowCode: string;
  sourceSystem: string;
  targetSystem: string;
  integrationType: string;
  frequency: string;
  dataElements: string;
  businessPurpose: string;
};

export default function IntegrationFlowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [row, setRow] = useState<FlowDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<FlowDetail>(`/api/integration-flows/${id}`, {
        signal: ac.signal,
        label: "integration-flow-detail",
        rejectHttpErrors: false,
      });
      if (ac.signal.aborted) return;
      setRow(result.ok && result.status < 300 ? result.data : null);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading integration flow…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Integration flow not found.</p>;

  return (
    <DetailPageShell
      entityCode={row.flowCode}
      title={`${row.flowCode} — Integration Flow`}
      subtitle={`${row.sourceSystem} → ${row.targetSystem}`}
      backHref="/integration-flows"
      backLabel="Back to Integration Flows"
    >
      <AdvancedCard title="Overview">
        <DetailFieldGrid>
          <DetailField label="Flow ID" value={row.flowCode} />
          <DetailField label="Source System" value={row.sourceSystem} />
          <DetailField label="Target System" value={row.targetSystem} />
          <DetailField label="Integration Type" value={row.integrationType} />
          <DetailField label="Frequency" value={row.frequency} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Data & purpose">
        <DetailFieldGrid>
          <DetailField label="Data Elements" value={row.dataElements} />
          <DetailField label="Business Purpose" value={row.businessPurpose} />
        </DetailFieldGrid>
      </AdvancedCard>
    </DetailPageShell>
  );
}
