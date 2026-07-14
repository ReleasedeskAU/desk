"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MockupDetailChrome,
  MockupSection,
  GlanceStrip,
  DetailField,
  DetailFieldGrid,
  dash,
} from "@/components/detail/MockupDetailChrome";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { Calendar, LayoutDashboard, List, Package } from "lucide-react";

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

type RiskOption = { id: string; riskCode: string };

const LIKELIHOOD: Record<number, string> = {
  1: "Rare",
  2: "Unlikely",
  3: "Possible",
  4: "Likely",
  5: "Almost Certain",
};

const IMPACT: Record<number, string> = {
  1: "Negligible",
  2: "Minor",
  3: "Moderate",
  4: "Major",
  5: "Catastrophic",
};

function formatScale(n: number, map: Record<number, string>) {
  const label = map[n];
  return label ? `${n} (${label})` : String(n);
}

function riskLevelFromScore(score: number) {
  if (score <= 5) return { label: "🟢 LOW", severity: "Low", tone: "good" as const };
  if (score <= 12) return { label: "🟡 MEDIUM", severity: "Medium", tone: "warn" as const };
  if (score <= 19) return { label: "🟠 HIGH", severity: "High", tone: "warn" as const };
  return { label: "🔴 CRITICAL", severity: "Critical", tone: "bad" as const };
}

function daysOut(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export default function RiskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<RiskDetail | null>(null);
  const [options, setOptions] = useState<RiskOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [detail, list] = await Promise.all([
        safeFetchJson<RiskDetail>(`/api/risks/${id}`, {
          signal: ac.signal,
          label: "risk-detail",
          rejectHttpErrors: false,
        }),
        safeFetchJson<RiskOption[]>("/api/risks", { signal: ac.signal, label: "risks-list" }),
      ]);
      if (ac.signal.aborted) return;
      setRow(detail.ok && detail.status < 300 ? detail.data : null);
      setOptions(list.ok ? list.data.map((r) => ({ id: r.id, riskCode: r.riskCode })) : []);
      setLastRefresh(new Date());
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.riskCode.localeCompare(b.riskCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.riskCode })),
    [options]
  );

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading risk…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Risk not found.</p>;

  const level = riskLevelFromScore(row.riskScore);
  const leaveMatch = row.notes?.match(/LV-\d+/i)?.[0];

  return (
    <MockupDetailChrome
      pageTitle="🚨 RISK DETAIL PAGE"
      entityCode={row.riskCode}
      selectLabel="Select Risk"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: row.riskCode }]}
      onSelectChange={(v) => v !== row.id && router.push(`/risks/${v}`)}
      lastRefresh={lastRefresh}
      footer="Risk Page v1.0 | Data sourced from Risk sheet | Risk Score = Likelihood × Impact"
      quickActions={[
        {
          href: `/releases/${row.release.id}`,
          label: "📋 View Release",
          icon: <Package className="mr-1 inline h-4 w-4" />,
        },
        {
          href: leaveMatch ? `/leaves/${encodeURIComponent(leaveMatch)}` : "/leaves",
          label: "📅 View Leave",
          icon: <Calendar className="mr-1 inline h-4 w-4" />,
        },
        { href: "/risks", label: "📊 Risk Matrix", icon: <LayoutDashboard className="mr-1 inline h-4 w-4" /> },
        { href: "/risks", label: "🔙 All Risks", icon: <List className="mr-1 inline h-4 w-4" /> },
      ]}
    >
      <MockupSection title="🚦 RISK STATUS AT A GLANCE">
        <GlanceStrip
          items={[
            { label: "Risk Score", value: row.riskScore },
            { label: "Status", value: <StatusBadge status={row.status} /> },
            { label: "Severity", value: level.severity, tone: level.tone },
            { label: "Likelihood", value: formatScale(row.likelihood, LIKELIHOOD) },
            { label: "Impact", value: formatScale(row.impact, IMPACT) },
            { label: "Risk Level", value: level.label, tone: level.tone },
          ]}
        />
      </MockupSection>

      <MockupSection title="📦 ASSOCIATED RELEASE">
        <DetailFieldGrid cols={2}>
          <DetailField
            label="Release ID"
            value={
              <ProgressLink
                href={`/releases/${row.release.id}`}
                className="font-mono text-brand-600 hover:underline dark:text-brand-400"
              >
                {row.release.releaseCode}
              </ProgressLink>
            }
          />
          <DetailField label="Release Name" value={dash(row.release.name)} />
          <DetailField label="Application" value={dash(row.applicationName)} />
          <DetailField label="Department" value={dash(row.departmentName)} />
          <DetailField label="Prod Date" value={formatDate(row.release.releaseDate)} />
          <DetailField label="Days Out" value={daysOut(row.release.releaseDate)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="📋 RISK DETAILS">
        <DetailFieldGrid cols={2}>
          <DetailField label="Risk Category" value={dash(row.category)} />
          <DetailField label="Affected Area" value={dash(row.affectedArea)} />
        </DetailFieldGrid>
        <div className="mt-3">
          <DetailField label="Risk Description" value={dash(row.description)} />
        </div>
      </MockupSection>

      <MockupSection title="🛡️ MITIGATION">
        <DetailField label="Mitigation Strategy" value={dash(row.mitigationStrategy)} />
        <DetailFieldGrid cols={2}>
          <DetailField label="Risk Owner" value={dash(row.riskOwner?.name)} />
          <DetailField label="Risk Owner ID" value={dash(row.riskOwner?.userId)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="📝 NOTES">
        <DetailField label="Notes" value={dash(row.notes)} />
      </MockupSection>
    </MockupDetailChrome>
  );
}
