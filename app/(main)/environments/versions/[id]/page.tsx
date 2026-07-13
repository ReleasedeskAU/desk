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
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { ArrowUp, GitCompare, History, List, Search } from "lucide-react";

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

type VersionListRow = {
  id: string;
  appCode: string | null;
  version?: string | null;
  environment?: { name?: string };
};

type DeskPayload = { versions?: VersionListRow[] };

function alignmentFromStatus(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("behind") || s.includes("drift") || s.includes("outdated")) {
    return { label: "🔴 Drift", tone: "bad" as const, drift: "High" };
  }
  if (s.includes("current") || s.includes("sync") || s.includes("in sync")) {
    return { label: "🟢 In Sync", tone: "good" as const, drift: "Low" };
  }
  if (!status) return { label: "—", tone: "neutral" as const, drift: "—" };
  return { label: status, tone: "neutral" as const, drift: "Medium" };
}

export default function VersionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<VersionDetail | null>(null);
  const [options, setOptions] = useState<VersionListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [detail, list] = await Promise.all([
        safeFetchJson<VersionDetail>(`/api/environment-versions/${id}`, {
          signal: ac.signal,
          label: "version-detail",
          rejectHttpErrors: false,
        }),
        safeFetchJson<DeskPayload>("/api/environment-desk", {
          signal: ac.signal,
          label: "versions-list",
        }),
      ]);
      if (ac.signal.aborted) return;
      setRow(detail.ok && detail.status < 300 ? detail.data : null);
      setOptions(list.ok && list.data.versions ? list.data.versions : []);
      setLastRefresh(new Date());
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  const selectOptions = useMemo(() => {
    const mapped = options
      .filter((o) => o.id)
      .map((o) => ({
        value: o.id,
        label: o.appCode
          ? `${o.appCode}${o.environment?.name ? ` · ${o.environment.name}` : ""}`
          : o.id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    return mapped;
  }, [options]);

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading version…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Version not found.</p>;

  const code = row.appCode ?? row.id;
  const alignment = alignmentFromStatus(row.status);

  return (
    <MockupDetailChrome
      pageTitle="📦 VERSION DETAIL PAGE"
      entityCode={code}
      selectLabel="Select Application"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: code }]}
      onSelectChange={(v) => v !== row.id && router.push(`/environments/versions/${v}`)}
      lastRefresh={lastRefresh}
      footer="Version Page v1.0 | Data sourced from Versions sheet | Application version tracking across environments"
      quickActions={[
        {
          href: "/environments",
          label: "🔄 Compare Versions",
          icon: <GitCompare className="mr-1 inline h-4 w-4" />,
        },
        {
          href: "/environments",
          label: "📊 Version History",
          icon: <History className="mr-1 inline h-4 w-4" />,
        },
        {
          href: `/environments/versions/${row.id}`,
          label: "⬆️ Plan Upgrade",
          icon: <ArrowUp className="mr-1 inline h-4 w-4" />,
        },
        { href: "/drifts", label: "🔍 View Drift", icon: <Search className="mr-1 inline h-4 w-4" /> },
        { href: "/environments", label: "🔙 All Versions", icon: <List className="mr-1 inline h-4 w-4" /> },
      ]}
    >
      <MockupSection title="🚦 VERSION ALIGNMENT STATUS">
        <GlanceStrip
          items={[
            { label: "Alignment", value: alignment.label, tone: alignment.tone },
            { label: "Drift Risk", value: alignment.drift, tone: alignment.tone },
            {
              label: "Last Updated",
              value: row.deployDate ? formatDate(row.deployDate) : "—",
            },
          ]}
        />
      </MockupSection>

      <MockupSection title="📋 APPLICATION INFORMATION">
        <DetailFieldGrid cols={2}>
          <DetailField label="App ID" value={dash(row.appCode)} />
          <DetailField label="Application" value={dash(row.application.name)} />
          <DetailField label="Department" value={dash(row.application.department?.name)} />
          <DetailField label="Owner" value={dash(row.updatedBy)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="🖥️ VERSION BY ENVIRONMENT">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-[var(--border)] dark:text-white/45">
                <th className="px-2 py-2 font-semibold">Environment</th>
                <th className="px-2 py-2 font-semibold">Version</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold">Last Deployed</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 dark:border-[var(--border)]">
                <td className="px-2 py-2.5 font-medium text-gray-900 dark:text-white">
                  {row.environment.name}
                </td>
                <td className="px-2 py-2.5 font-mono text-gray-800 dark:text-white/85">{row.version}</td>
                <td className="px-2 py-2.5">
                  {row.status ? <StatusBadge status={row.status} /> : "—"}
                </td>
                <td className="px-2 py-2.5 text-gray-700 dark:text-white/75">
                  {row.deployDate ? formatDate(row.deployDate) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </MockupSection>

      <MockupSection title="📝 NOTES">
        <DetailField label="Notes" value={dash(row.notes)} />
      </MockupSection>
    </MockupDetailChrome>
  );
}
