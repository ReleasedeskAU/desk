"use client";

import { use, useEffect, useState } from "react";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { safeFetchJson } from "@/lib/safe-fetch";
import { taBtnSecondary } from "@/lib/styles";
import { Package } from "lucide-react";

type DependencyDetail = {
  id: string;
  depCode: string;
  dependencyType: string;
  status: string;
  impactIfBlocked: string;
  notes: string | null;
  release: { id: string; releaseCode: string; name: string; status: string };
  dependsOnRelease: { id: string; releaseCode: string; name: string; status: string };
};

export default function DependencyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [row, setRow] = useState<DependencyDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<DependencyDetail>(`/api/dependencies/${id}`, {
        signal: ac.signal,
        label: "dependency-detail",
        rejectHttpErrors: false,
      });
      if (ac.signal.aborted) return;
      setRow(result.ok && result.status < 300 ? result.data : null);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading dependency…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Dependency not found.</p>;

  const code = row.depCode || row.id;

  return (
    <DetailPageShell
      entityCode={code}
      title={`${code} — Dependency`}
      subtitle={`${row.release.releaseCode} → ${row.dependsOnRelease.releaseCode}`}
      backHref="/dependencies"
      backLabel="Back to Dependencies"
      badges={row.status ? <StatusBadge status={row.status} /> : undefined}
      actions={
        <>
          <ProgressLink href={`/releases/${row.release.id}`} className={taBtnSecondary + " text-sm !py-2"}>
            <Package className="h-4 w-4 inline mr-1" /> {row.release.releaseCode}
          </ProgressLink>
          <ProgressLink href={`/releases/${row.dependsOnRelease.id}`} className={taBtnSecondary + " text-sm !py-2"}>
            <Package className="h-4 w-4 inline mr-1" /> {row.dependsOnRelease.releaseCode}
          </ProgressLink>
        </>
      }
    >
      <AdvancedCard title="Overview">
        <DetailFieldGrid>
          <DetailField label="Dep ID" value={code} />
          <DetailField label="Dependency Type" value={row.dependencyType || "—"} />
          <DetailField label="Status" value={row.status || "—"} />
          <DetailField label="Impact if Blocked" value={row.impactIfBlocked || "—"} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Release pair">
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
          <DetailField
            label="Depends On Release"
            value={
              <ProgressLink
                href={`/releases/${row.dependsOnRelease.id}`}
                className="text-brand-600 hover:underline dark:text-brand-400"
              >
                {row.dependsOnRelease.releaseCode}
              </ProgressLink>
            }
          />
          <DetailField label="Depends On Name" value={row.dependsOnRelease.name} />
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
