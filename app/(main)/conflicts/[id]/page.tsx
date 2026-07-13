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
import { Calendar, CalendarCheck, List, Package } from "lucide-react";

type ConflictDetail = {
  id: string;
  conflictCode: string;
  status: string;
  priority: string;
  assignedTo: string;
  release1Code: string;
  release2Code: string;
  release1: { id: string; releaseCode: string; name: string } | null;
  release2: { id: string; releaseCode: string; name: string } | null;
  application: string;
  department: string;
  conflictingEnvironment: string;
  environmentConflictType: string;
  notes: string | null;
};

type ConflictOption = { id: string; conflictCode: string };

const PRIORITY_TONE: Record<string, "bad" | "warn" | "neutral"> = {
  "P1 - Critical": "bad",
  "P2 - High": "warn",
  "P3 - Medium": "neutral",
};

export default function ConflictDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<ConflictDetail | null>(null);
  const [options, setOptions] = useState<ConflictOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [detail, list] = await Promise.all([
        safeFetchJson<ConflictDetail>(`/api/conflicts/${id}`, {
          signal: ac.signal,
          label: "conflict-detail",
          rejectHttpErrors: false,
        }),
        safeFetchJson<ConflictOption[]>("/api/conflicts", { signal: ac.signal, label: "conflicts-list" }),
      ]);
      if (ac.signal.aborted) return;
      setRow(detail.ok && detail.status < 300 ? detail.data : null);
      setOptions(list.ok ? list.data.map((c) => ({ id: c.id, conflictCode: c.conflictCode })) : []);
      setLastRefresh(new Date());
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.conflictCode.localeCompare(b.conflictCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.conflictCode })),
    [options]
  );

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading conflict…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Conflict not found.</p>;

  const apps = row.application.includes("/")
    ? row.application
    : row.application;
  const depts = row.department.includes("/")
    ? row.department
    : row.department;

  return (
    <MockupDetailChrome
      pageTitle="⚠️ CONFLICT DETAIL PAGE"
      entityCode={row.conflictCode}
      selectLabel="Select Conflict"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: row.conflictCode }]}
      onSelectChange={(v) => v !== row.id && router.push(`/conflicts/${v}`)}
      lastRefresh={lastRefresh}
      footer="Conflict Page v1.0 | Data sourced from Environment Conflicts sheet"
      quickActions={[
        { href: "/calendar", label: "📅 View Calendar", icon: <Calendar className="mr-1 inline h-4 w-4" /> },
        { href: "/booking", label: "🖥️ Env Booking", icon: <CalendarCheck className="mr-1 inline h-4 w-4" /> },
        ...(row.release1
          ? [{ href: `/releases/${row.release1.id}`, label: `📋 View Release 1`, icon: <Package className="mr-1 inline h-4 w-4" /> }]
          : []),
        ...(row.release2
          ? [{ href: `/releases/${row.release2.id}`, label: `📋 View Release 2`, icon: <Package className="mr-1 inline h-4 w-4" /> }]
          : []),
        { href: "/conflicts", label: "🔙 All Conflicts", icon: <List className="mr-1 inline h-4 w-4" /> },
      ]}
    >
      <MockupSection title="🚦 Conflict Status at a Glance">
        <GlanceStrip
          items={[
            { label: "Status", value: <StatusBadge status={row.status} />, tone: row.status === "Open" ? "warn" : "good" },
            {
              label: "Priority",
              value: row.priority,
              tone: PRIORITY_TONE[row.priority] ?? "neutral",
            },
            { label: "Assigned To", value: dash(row.assignedTo) },
          ]}
        />
      </MockupSection>

      <MockupSection title="🔄 Conflicting Releases">
        <DetailFieldGrid cols={2}>
          <DetailField
            label="Release 1"
            value={
              row.release1 ? (
                <ProgressLink href={`/releases/${row.release1.id}`} className="font-mono text-brand-600 hover:underline dark:text-brand-400">
                  {row.release1Code}
                </ProgressLink>
              ) : (
                <span className="font-mono">{row.release1Code}</span>
              )
            }
          />
          <DetailField label="Name" value={dash(row.release1?.name)} />
          <DetailField
            label="Release 2"
            value={
              row.release2 ? (
                <ProgressLink href={`/releases/${row.release2.id}`} className="font-mono text-brand-600 hover:underline dark:text-brand-400">
                  {row.release2Code}
                </ProgressLink>
              ) : (
                <span className="font-mono">{row.release2Code}</span>
              )
            }
          />
          <DetailField label="Name" value={dash(row.release2?.name)} />
          <DetailField label="Applications" value={dash(apps)} />
          <DetailField label="Departments" value={dash(depts)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="🖥️ Environment Conflict Details">
        <DetailFieldGrid cols={2}>
          <DetailField label="Conflicting Env" value={dash(row.conflictingEnvironment)} />
          <DetailField label="Conflict Type" value={dash(row.environmentConflictType)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="📝 Notes & Resolution">
        <DetailField label="Notes" value={dash(row.notes)} />
      </MockupSection>
    </MockupDetailChrome>
  );
}
