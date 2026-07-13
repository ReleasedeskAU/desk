"use client";

import { use, useEffect, useState } from "react";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";

type VersionDetail = {
  id: string;
  appCode: string | null;
  version: string;
  buildNumber: string | null;
  deployDate: string | null;
  updatedBy: string | null;
  status: string | null;
  notes: string | null;
  application: { id: string; name: string; department: { name: string } | null };
  environment: { id: string; name: string; type: string };
};

export default function VersionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [row, setRow] = useState<VersionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<VersionDetail>(`/api/environment-versions/${id}`, {
        signal: ac.signal,
        label: "version-detail",
        rejectHttpErrors: false,
      });
      if (ac.signal.aborted) return;
      setRow(result.ok && result.status < 300 ? result.data : null);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading version…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Version not found.</p>;

  const code = row.appCode ?? row.id;

  return (
    <DetailPageShell
      entityCode={code}
      title={`${row.application.name} — ${row.environment.name}`}
      subtitle={`Version ${row.version}${row.buildNumber ? ` · Build ${row.buildNumber}` : ""}`}
      backHref="/environments"
      backLabel="Back to Versions & Config"
      badges={row.status ? <StatusBadge status={row.status} /> : undefined}
    >
      <AdvancedCard title="Identity">
        <DetailFieldGrid>
          <DetailField label="App ID" value={row.appCode ?? "—"} />
          <DetailField label="Application" value={row.application.name} />
          <DetailField label="Department" value={row.application.department?.name ?? "—"} />
          <DetailField label="Environment" value={row.environment.name} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Deployment">
        <DetailFieldGrid>
          <DetailField label="Version" value={row.version} />
          <DetailField label="Build Number" value={row.buildNumber ?? "—"} />
          <DetailField label="Deploy Date" value={row.deployDate ? formatDate(row.deployDate) : "—"} />
          <DetailField label="Deployed By" value={row.updatedBy ?? "—"} />
          <DetailField label="Status" value={row.status ?? "—"} />
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
