"use client";

import { use, useEffect, useState } from "react";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";

type LeaveDetail = {
  id: string;
  leaveCode: string;
  leaveStart: string;
  leaveEnd: string;
  leaveType: string;
  days: number;
  riskImpact: string | null;
  riskScore: number;
  user: { id: string; userId: string; name: string; role: string; department: string };
  affectedReleases: { release: { id: string; releaseCode: string; name: string; status: string } }[];
};

export default function LeaveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [row, setRow] = useState<LeaveDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<LeaveDetail>(`/api/leaves/${id}`, {
        signal: ac.signal,
        label: "leave-detail",
        rejectHttpErrors: false,
      });
      if (ac.signal.aborted) return;
      setRow(result.ok && result.status < 300 ? result.data : null);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading leave…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Leave record not found.</p>;

  return (
    <DetailPageShell
      entityCode={row.leaveCode}
      title={`${row.leaveCode} — Leave`}
      subtitle={`${row.user.name} · ${row.leaveType} · ${row.days} day${row.days === 1 ? "" : "s"}`}
      backHref="/leaves"
      backLabel="Back to Leave Calendar"
    >
      <AdvancedCard title="Staff">
        <DetailFieldGrid>
          <DetailField label="Leave ID" value={row.leaveCode} />
          <DetailField label="User ID" value={row.user.userId} />
          <DetailField label="User Name" value={row.user.name} />
          <DetailField label="Department" value={row.user.department} />
          <DetailField label="Role" value={row.user.role} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Leave window">
        <DetailFieldGrid>
          <DetailField label="Leave Type" value={row.leaveType} />
          <DetailField label="Leave Start" value={formatDate(row.leaveStart)} />
          <DetailField label="Leave End" value={formatDate(row.leaveEnd)} />
          <DetailField label="Days" value={row.days} />
          <DetailField label="Risk Impact" value={row.riskImpact ?? "—"} />
          <DetailField label="Risk Score" value={row.riskScore} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Affected releases">
        {row.affectedReleases.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-white/60">No affected releases linked.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {row.affectedReleases.map(({ release }) => (
              <li key={release.id}>
                <ProgressLink href={`/releases/${release.id}`} className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400">
                  {release.releaseCode}
                </ProgressLink>
                {" — "}
                {release.name}
              </li>
            ))}
          </ul>
        )}
      </AdvancedCard>
    </DetailPageShell>
  );
}
