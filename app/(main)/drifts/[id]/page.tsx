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
import { LayoutDashboard, List, Package, Server } from "lucide-react";

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

type DriftOption = { id: string; driftCode: string };

function severityTone(severity: string): "bad" | "warn" | "neutral" | "good" {
  const s = severity.toLowerCase();
  if (s.includes("critical") || s.includes("high")) return "bad";
  if (s.includes("medium")) return "warn";
  if (s.includes("low")) return "good";
  return "neutral";
}

function severityLabel(severity: string) {
  const s = severity.toLowerCase();
  if (s.includes("critical")) return `🔴 ${severity}`;
  if (s.includes("high")) return `🔴 ${severity}`;
  if (s.includes("medium")) return `🟡 ${severity}`;
  if (s.includes("low")) return `🟢 ${severity}`;
  return severity;
}

export default function DriftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<DriftDetail | null>(null);
  const [options, setOptions] = useState<DriftOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [detail, list] = await Promise.all([
        safeFetchJson<DriftDetail>(`/api/drifts/${id}`, {
          signal: ac.signal,
          label: "drift-detail",
          rejectHttpErrors: false,
        }),
        safeFetchJson<DriftOption[]>("/api/drifts", { signal: ac.signal, label: "drifts-list" }),
      ]);
      if (ac.signal.aborted) return;
      setRow(detail.ok && detail.status < 300 ? detail.data : null);
      setOptions(list.ok ? list.data.map((d) => ({ id: d.id, driftCode: d.driftCode })) : []);
      setLastRefresh(new Date());
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.driftCode.localeCompare(b.driftCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.driftCode })),
    [options]
  );

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading drift…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Drift not found.</p>;

  return (
    <MockupDetailChrome
      pageTitle="📉 DRIFT DETAIL PAGE"
      entityCode={row.driftCode}
      selectLabel="Select Drift"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: row.driftCode }]}
      onSelectChange={(v) => v !== row.id && router.push(`/drifts/${v}`)}
      lastRefresh={lastRefresh}
      footer="Drift Page v1.0 | Data sourced from Drift sheet | Track environment & application drift issues"
      quickActions={[
        {
          href: `/releases/${row.release.id}`,
          label: "📋 View Release",
          icon: <Package className="mr-1 inline h-4 w-4" />,
        },
        { href: "/environments", label: "🖥️ View Env", icon: <Server className="mr-1 inline h-4 w-4" /> },
        { href: "/dashboard", label: "📊 Dashboard", icon: <LayoutDashboard className="mr-1 inline h-4 w-4" /> },
        { href: "/drifts", label: "🔙 All Drifts", icon: <List className="mr-1 inline h-4 w-4" /> },
      ]}
    >
      <MockupSection title="🚦 DRIFT STATUS AT A GLANCE">
        <GlanceStrip
          items={[
            { label: "Status", value: <StatusBadge status={row.status} /> },
            {
              label: "Severity",
              value: severityLabel(row.severity),
              tone: severityTone(row.severity),
            },
            { label: "ETA to Fix", value: row.etaToFix ? formatDate(row.etaToFix) : "—" },
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
          <DetailField label="Application" value={dash(row.application.name)} />
          <DetailField label="Department" value={dash(row.departmentName)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="🖥️ ENVIRONMENT DETAILS">
        <DetailFieldGrid cols={2}>
          <DetailField label="Environment" value={dash(row.environmentName)} />
          <DetailField label="Drift Type" value={dash(row.driftType)} />
          <DetailField label="Drift Category" value={dash(row.driftCategory)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="📋 DRIFT DESCRIPTION">
        <DetailField label="Description" value={dash(row.description)} />
      </MockupSection>

      <MockupSection title="⚠️ IMPACT ON RELEASE">
        <DetailField label="Impact" value={dash(row.impactOnRelease)} />
      </MockupSection>

      <MockupSection title="🛠️ REMEDIATION">
        <DetailField label="Remediation Action" value={dash(row.remediationAction)} />
      </MockupSection>

      <MockupSection title="📅 TIMELINE">
        <DetailFieldGrid cols={2}>
          <DetailField label="Detected Date" value={formatDate(row.detectedDate)} />
          <DetailField label="ETA to Fix" value={row.etaToFix ? formatDate(row.etaToFix) : "—"} />
        </DetailFieldGrid>
      </MockupSection>
    </MockupDetailChrome>
  );
}
