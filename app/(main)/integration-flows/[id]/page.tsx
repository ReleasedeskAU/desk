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
import { safeFetchJson } from "@/lib/safe-fetch";
import { LayoutDashboard, List, Mail, Network, Plug } from "lucide-react";

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

type FlowOption = { id: string; flowCode: string; sourceSystem?: string };

export default function IntegrationFlowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<FlowDetail | null>(null);
  const [options, setOptions] = useState<FlowOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [detail, list] = await Promise.all([
        safeFetchJson<FlowDetail>(`/api/integration-flows/${id}`, {
          signal: ac.signal,
          label: "integration-flow-detail",
          rejectHttpErrors: false,
        }),
        safeFetchJson<FlowOption[]>("/api/integration-flows", {
          signal: ac.signal,
          label: "integration-flows-list",
        }),
      ]);
      if (ac.signal.aborted) return;
      setRow(detail.ok && detail.status < 300 ? detail.data : null);
      setOptions(
        list.ok
          ? list.data.map((f) => ({
              id: f.id,
              flowCode: f.flowCode,
              sourceSystem: f.sourceSystem,
            }))
          : []
      );
      setLastRefresh(new Date());
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.flowCode.localeCompare(b.flowCode, undefined, { numeric: true }))
        .map((o) => ({
          value: o.id,
          label: o.sourceSystem ? `${o.flowCode} · ${o.sourceSystem}` : o.flowCode,
        })),
    [options]
  );

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading integration flow…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Integration flow not found.</p>;

  return (
    <MockupDetailChrome
      pageTitle="🔌 INTEGRATION DETAIL PAGE"
      entityCode={row.flowCode}
      selectLabel="Select System"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: row.flowCode }]}
      onSelectChange={(v) => v !== row.id && router.push(`/integration-flows/${v}`)}
      lastRefresh={lastRefresh}
      footer="Integration Page v1.0 | Data sourced from System Mapping sheet | System integration & data flow tracking"
      quickActions={[
        {
          href: "/integration-flows",
          label: "📊 Integration Map",
          icon: <Network className="mr-1 inline h-4 w-4" />,
        },
        {
          href: `/integration-flows/${row.id}`,
          label: "🔍 Test Connection",
          icon: <Plug className="mr-1 inline h-4 w-4" />,
        },
        {
          href: "/dependencies",
          label: "📋 View Dependencies",
          icon: <LayoutDashboard className="mr-1 inline h-4 w-4" />,
        },
        {
          href: `/integration-flows/${row.id}`,
          label: "📧 Notify Owners",
          icon: <Mail className="mr-1 inline h-4 w-4" />,
        },
        {
          href: "/integration-flows",
          label: "🔙 All Integrations",
          icon: <List className="mr-1 inline h-4 w-4" />,
        },
      ]}
    >
      <MockupSection title="🚦 INTEGRATION STATUS AT A GLANCE">
        <GlanceStrip
          items={[
            { label: "Status", value: "🟢 Active", tone: "good" },
            { label: "Integration Count", value: 1 },
            { label: "Last Tested", value: "—" },
          ]}
        />
      </MockupSection>

      <MockupSection title="📋 SYSTEM INFORMATION">
        <DetailFieldGrid cols={2}>
          <DetailField label="System Name" value={dash(row.sourceSystem)} />
          <DetailField label="Department" value="—" />
          <DetailField label="System Type" value={dash(row.integrationType)} />
          <DetailField label="Owner" value="—" />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="🔗 INTEGRATIONS (Systems This Connects To)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-[var(--border)] dark:text-white/45">
                <th className="px-2 py-2 font-semibold">Integrates With</th>
                <th className="px-2 py-2 font-semibold">Data Flow</th>
                <th className="px-2 py-2 font-semibold">Key Data Exchanged</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 dark:border-[var(--border)]">
                <td className="px-2 py-2.5 font-medium text-gray-900 dark:text-white">
                  {row.targetSystem}
                </td>
                <td className="px-2 py-2.5 text-gray-800 dark:text-white/85">{row.integrationType}</td>
                <td className="px-2 py-2.5 text-gray-700 dark:text-white/75">{row.dataElements}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </MockupSection>

      <MockupSection title="⚠️ INTEGRATION DEPENDENCIES">
        <p className="text-sm text-gray-600 dark:text-white/70">This system must be available for:</p>
        <p className="mt-2 text-sm text-gray-500 dark:text-white/55">—</p>
      </MockupSection>

      <MockupSection title="📝 INTEGRATION NOTES">
        <DetailField label="Notes" value={dash(row.businessPurpose)} />
      </MockupSection>
    </MockupDetailChrome>
  );
}
