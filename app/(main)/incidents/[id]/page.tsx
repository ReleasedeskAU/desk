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
import { formatDateTime } from "@/lib/utils";
import { LayoutDashboard, List, Mail, Package, RefreshCw } from "lucide-react";

type IncidentDetail = {
  id: string;
  incidentCode: string;
  timestamp: string;
  departmentName: string | null;
  severity: string;
  title: string;
  status: string;
  impact: string;
  assignedTo: string | null;
  relatedReleaseCode: string | null;
  environmentName: string;
  application: { id: string; name: string };
  relatedRelease: { id: string; releaseCode: string; name: string; status: string } | null;
};

type IncidentOption = { id: string; incidentCode: string };

function severityTone(severity: string): "bad" | "warn" | "neutral" | "good" {
  const s = severity.toLowerCase();
  if (s.includes("sev-1") || s.includes("p1") || s.includes("critical")) return "bad";
  if (s.includes("sev-2") || s.includes("p2") || s.includes("high")) return "bad";
  if (s.includes("medium") || s.includes("p3")) return "warn";
  if (s.includes("low")) return "good";
  return "neutral";
}

function severityLabel(severity: string) {
  const s = severity.toUpperCase();
  if (s.includes("SEV-1") || s === "P1" || s.includes("CRITICAL")) return `🔴 ${severity}`;
  if (s.includes("SEV-2") || s === "P2" || s.includes("HIGH")) return `🔴 ${severity}`;
  if (s.includes("MEDIUM") || s === "P3") return `🟡 ${severity}`;
  return severity;
}

function impactTone(impact: string): "bad" | "warn" | "neutral" | "good" {
  const s = impact.toLowerCase();
  if (s.includes("critical") || s.includes("high")) return "bad";
  if (s.includes("medium")) return "warn";
  if (s.includes("low")) return "good";
  return "neutral";
}

export default function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<IncidentDetail | null>(null);
  const [options, setOptions] = useState<IncidentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [detail, list] = await Promise.all([
        safeFetchJson<IncidentDetail>(`/api/incidents/${id}`, {
          signal: ac.signal,
          label: "incident-detail",
          rejectHttpErrors: false,
        }),
        safeFetchJson<IncidentOption[]>("/api/incidents", {
          signal: ac.signal,
          label: "incidents-list",
        }),
      ]);
      if (ac.signal.aborted) return;
      setRow(detail.ok && detail.status < 300 ? detail.data : null);
      setOptions(list.ok ? list.data.map((i) => ({ id: i.id, incidentCode: i.incidentCode })) : []);
      setLastRefresh(new Date());
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.incidentCode.localeCompare(b.incidentCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.incidentCode })),
    [options]
  );

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading incident…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Incident not found.</p>;

  return (
    <MockupDetailChrome
      pageTitle="🚨 INCIDENT DETAIL PAGE"
      entityCode={row.incidentCode}
      selectLabel="Select Incident"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: row.incidentCode }]}
      onSelectChange={(v) => v !== row.id && router.push(`/incidents/${v}`)}
      lastRefresh={lastRefresh}
      footer="Incident Page v1.0 | Data sourced from Incidents sheet | P1/P2 incident tracking"
      quickActions={[
        ...(row.relatedRelease
          ? [
              {
                href: `/releases/${row.relatedRelease.id}`,
                label: "📋 View Release",
                icon: <Package className="mr-1 inline h-4 w-4" />,
              },
            ]
          : []),
        {
          href: `/incidents/${row.id}`,
          label: "📊 Timeline",
          icon: <LayoutDashboard className="mr-1 inline h-4 w-4" />,
        },
        {
          href: `/incidents/${row.id}`,
          label: "🔄 Update Status",
          icon: <RefreshCw className="mr-1 inline h-4 w-4" />,
        },
        { href: `/incidents/${row.id}`, label: "📧 Escalate", icon: <Mail className="mr-1 inline h-4 w-4" /> },
        { href: "/incidents", label: "🔙 All Incidents", icon: <List className="mr-1 inline h-4 w-4" /> },
      ]}
    >
      <MockupSection title="🚦 INCIDENT STATUS AT A GLANCE">
        <GlanceStrip
          items={[
            {
              label: "Severity",
              value: severityLabel(row.severity),
              tone: severityTone(row.severity),
            },
            { label: "Status", value: <StatusBadge status={row.status} /> },
            { label: "Impact", value: dash(row.impact), tone: impactTone(row.impact) },
          ]}
        />
      </MockupSection>

      <MockupSection title="📋 INCIDENT INFORMATION">
        <DetailFieldGrid cols={2}>
          <DetailField label="Incident ID" value={row.incidentCode} />
          <DetailField label="Title" value={dash(row.title)} />
          <DetailField label="Application" value={dash(row.application.name)} />
          <DetailField label="Environment" value={dash(row.environmentName)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="📅 TIMELINE">
        <DetailFieldGrid cols={2}>
          <DetailField label="Created" value={formatDateTime(row.timestamp)} />
          <DetailField label="Detected" value="—" />
          <DetailField label="Resolved" value="—" />
          <DetailField label="Duration" value="—" />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="🔗 LINKED RELEASE">
        <DetailFieldGrid cols={2}>
          <DetailField
            label="Release ID"
            value={
              row.relatedRelease ? (
                <ProgressLink
                  href={`/releases/${row.relatedRelease.id}`}
                  className="font-mono text-brand-600 hover:underline dark:text-brand-400"
                >
                  {row.relatedRelease.releaseCode}
                </ProgressLink>
              ) : (
                dash(row.relatedReleaseCode)
              )
            }
          />
          <DetailField label="Release Name" value={dash(row.relatedRelease?.name)} />
          <DetailField label="Root Cause" value="—" />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="👤 OWNERSHIP">
        <DetailFieldGrid cols={2}>
          <DetailField label="Assigned To" value={dash(row.assignedTo)} />
          <DetailField label="Incident Commander" value="—" />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="📝 NOTES & UPDATES">
        <DetailField label="Latest Update" value="—" />
      </MockupSection>
    </MockupDetailChrome>
  );
}
