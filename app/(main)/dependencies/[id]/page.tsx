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
import { LayoutDashboard, List, Package, RefreshCw } from "lucide-react";

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

type DependencyOption = { id: string; depCode: string };

function impactTone(impact: string): "bad" | "warn" | "neutral" | "good" {
  const s = impact.toLowerCase();
  if (s.includes("critical") || s.includes("high")) return "bad";
  if (s.includes("medium")) return "warn";
  if (s.includes("low")) return "good";
  return "neutral";
}

export default function DependencyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<DependencyDetail | null>(null);
  const [options, setOptions] = useState<DependencyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [detail, list] = await Promise.all([
        safeFetchJson<DependencyDetail>(`/api/dependencies/${id}`, {
          signal: ac.signal,
          label: "dependency-detail",
          rejectHttpErrors: false,
        }),
        safeFetchJson<DependencyOption[]>("/api/dependencies", {
          signal: ac.signal,
          label: "dependencies-list",
        }),
      ]);
      if (ac.signal.aborted) return;
      setRow(detail.ok && detail.status < 300 ? detail.data : null);
      setOptions(list.ok ? list.data.map((d) => ({ id: d.id, depCode: d.depCode })) : []);
      setLastRefresh(new Date());
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  const selectOptions = useMemo(
    () =>
      [...options]
        .filter((o) => o.depCode)
        .sort((a, b) => a.depCode.localeCompare(b.depCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.depCode })),
    [options]
  );

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading dependency…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Dependency not found.</p>;

  const code = row.depCode || row.id;
  // Excel Source = release (has the dependency); Dependent/Depends On = dependsOnRelease (upstream)
  const source = row.release;
  const dependent = row.dependsOnRelease;

  return (
    <MockupDetailChrome
      pageTitle="🔗 DEPENDENCY DETAIL PAGE"
      entityCode={code}
      selectLabel="Select Dependency"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: code }]}
      onSelectChange={(v) => v !== row.id && router.push(`/dependencies/${v}`)}
      lastRefresh={lastRefresh}
      footer="Dependency Page v1.0 | Data sourced from Dependencies sheet | Track inter-release dependencies"
      quickActions={[
        {
          href: `/releases/${source.id}`,
          label: "📋 View Source Release",
          icon: <Package className="mr-1 inline h-4 w-4" />,
        },
        {
          href: `/releases/${dependent.id}`,
          label: "📋 View Dependent",
          icon: <Package className="mr-1 inline h-4 w-4" />,
        },
        {
          href: `/dependencies/${row.id}`,
          label: "🔄 Update Status",
          icon: <RefreshCw className="mr-1 inline h-4 w-4" />,
        },
        {
          href: "/dependencies",
          label: "📊 Dependency Map",
          icon: <LayoutDashboard className="mr-1 inline h-4 w-4" />,
        },
        { href: "/dependencies", label: "🔙 All Dependencies", icon: <List className="mr-1 inline h-4 w-4" /> },
      ]}
    >
      <MockupSection title="🚦 DEPENDENCY STATUS AT A GLANCE">
        <GlanceStrip
          items={[
            {
              label: "Status",
              value: row.status ? <StatusBadge status={row.status} /> : "—",
            },
            { label: "Dependency Type", value: dash(row.dependencyType) },
            {
              label: "Impact if Blocked",
              value: dash(row.impactIfBlocked),
              tone: impactTone(row.impactIfBlocked ?? ""),
            },
          ]}
        />
      </MockupSection>

      <MockupSection title="📤 SOURCE RELEASE (Depends On)">
        <DetailFieldGrid cols={2}>
          <DetailField
            label="Release ID"
            value={
              <ProgressLink
                href={`/releases/${source.id}`}
                className="font-mono text-brand-600 hover:underline dark:text-brand-400"
              >
                {source.releaseCode}
              </ProgressLink>
            }
          />
          <DetailField label="Release Name" value={dash(source.name)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="📥 DEPENDENT RELEASE (Waiting For)">
        <DetailFieldGrid cols={2}>
          <DetailField
            label="Depends On ID"
            value={
              <ProgressLink
                href={`/releases/${dependent.id}`}
                className="font-mono text-brand-600 hover:underline dark:text-brand-400"
              >
                {dependent.releaseCode}
              </ProgressLink>
            }
          />
          <DetailField label="Depends On Name" value={dash(dependent.name)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="📋 DEPENDENCY DETAILS">
        <DetailFieldGrid cols={2}>
          <DetailField label="Dependency Type" value={dash(row.dependencyType)} />
          <DetailField label="Impact if Blocked" value={dash(row.impactIfBlocked)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="📝 NOTES">
        <DetailField label="Notes" value={dash(row.notes)} />
      </MockupSection>
    </MockupDetailChrome>
  );
}
