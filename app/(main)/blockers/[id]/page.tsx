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
import { ArrowUp, List, Mail, Package, Pencil } from "lucide-react";

type BlockerDetail = {
  id: string;
  blockerCode: string;
  releaseCode: string;
  releaseName: string;
  department: string;
  application: string;
  blockerType: string;
  blockerDescription: string;
  severity: string;
  raisedDate: string;
  raisedBy: string;
  assignedTo: string | null;
  status: string;
  targetResolutionDate: string | null;
  actualResolutionDate: string | null;
  daysOpen: number;
  escalationLevel: string;
  rootCause: string | null;
  resolutionNotes: string | null;
  impactOnRelease: string;
  release: { id: string; releaseCode: string; name: string; status: string } | null;
};

type BlockerOption = { id: string; blockerCode: string };

function severityTone(severity: string): "bad" | "warn" | "neutral" | "good" {
  const s = severity.toLowerCase();
  if (s.includes("critical")) return "bad";
  if (s.includes("high")) return "bad";
  if (s.includes("medium")) return "warn";
  if (s.includes("low")) return "good";
  return "neutral";
}

function statusTone(status: string): "bad" | "warn" | "good" | "neutral" {
  const s = status.toLowerCase();
  if (s.includes("open") || s.includes("block")) return "bad";
  if (s.includes("progress")) return "warn";
  if (s.includes("resolv") || s.includes("closed")) return "good";
  return "neutral";
}

export default function BlockerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<BlockerDetail | null>(null);
  const [options, setOptions] = useState<BlockerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [detail, list] = await Promise.all([
        safeFetchJson<BlockerDetail>(`/api/blockers/${id}`, {
          signal: ac.signal,
          label: "blocker-detail",
          rejectHttpErrors: false,
        }),
        safeFetchJson<BlockerOption[]>("/api/blockers", {
          signal: ac.signal,
          label: "blockers-list",
        }),
      ]);
      if (ac.signal.aborted) return;
      setRow(detail.ok && detail.status < 300 ? detail.data : null);
      setOptions(list.ok ? list.data.map((b) => ({ id: b.id, blockerCode: b.blockerCode })) : []);
      setLastRefresh(new Date());
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.blockerCode.localeCompare(b.blockerCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.blockerCode })),
    [options]
  );

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading blocker…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Blocker not found.</p>;

  return (
    <MockupDetailChrome
      pageTitle="🚧 BLOCKER DETAIL PAGE"
      entityCode={row.blockerCode}
      selectLabel="Select Blocker"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: row.blockerCode }]}
      onSelectChange={(v) => v !== row.id && router.push(`/blockers/${v}`)}
      lastRefresh={lastRefresh}
      footer="Blocker Page v1.0 | Data sourced from Blockers sheet | Release blocker tracking & escalation"
      quickActions={[
        ...(row.release
          ? [
              {
                href: `/releases/${row.release.id}`,
                label: "📋 View Release",
                icon: <Package className="mr-1 inline h-4 w-4" />,
              },
            ]
          : []),
        { href: `/blockers/${row.id}`, label: "⬆️ Escalate", icon: <ArrowUp className="mr-1 inline h-4 w-4" /> },
        {
          href: `/blockers/${row.id}`,
          label: "✏️ Update Status",
          icon: <Pencil className="mr-1 inline h-4 w-4" />,
        },
        { href: `/blockers/${row.id}`, label: "📧 Notify", icon: <Mail className="mr-1 inline h-4 w-4" /> },
        { href: "/blockers", label: "🔙 All Blockers", icon: <List className="mr-1 inline h-4 w-4" /> },
      ]}
    >
      <MockupSection title="🚦 BLOCKER STATUS AT A GLANCE">
        <GlanceStrip
          items={[
            {
              label: "Status",
              value: <StatusBadge status={row.status} />,
              tone: statusTone(row.status),
            },
            { label: "Severity", value: row.severity, tone: severityTone(row.severity) },
            { label: "Days Open", value: row.daysOpen },
          ]}
        />
      </MockupSection>

      <MockupSection title="📋 BLOCKER INFORMATION">
        <DetailFieldGrid cols={2}>
          <DetailField label="Blocker ID" value={row.blockerCode} />
          <DetailField label="Category" value={dash(row.blockerType)} />
        </DetailFieldGrid>
        <div className="mt-3">
          <DetailField label="Description" value={dash(row.blockerDescription)} />
        </div>
      </MockupSection>

      <MockupSection title="🔗 AFFECTED RELEASE">
        <DetailFieldGrid cols={2}>
          <DetailField
            label="Release ID"
            value={
              row.release ? (
                <ProgressLink
                  href={`/releases/${row.release.id}`}
                  className="font-mono text-brand-600 hover:underline dark:text-brand-400"
                >
                  {row.release.releaseCode}
                </ProgressLink>
              ) : (
                <span className="font-mono">{row.releaseCode}</span>
              )
            }
          />
          <DetailField label="Release Name" value={dash(row.releaseName)} />
          <DetailField label="Impact on Release" value={dash(row.impactOnRelease)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="👤 OWNERSHIP & ESCALATION">
        <DetailFieldGrid cols={2}>
          <DetailField label="Raised By" value={dash(row.raisedBy)} />
          <DetailField label="Assigned To" value={dash(row.assignedTo)} />
          <DetailField label="Escalation Level" value={dash(row.escalationLevel)} />
          <DetailField label="Escalated To" value="—" />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="📅 TIMELINE">
        <DetailFieldGrid cols={2}>
          <DetailField label="Raised Date" value={formatDate(row.raisedDate)} />
          <DetailField
            label="Target Resolution"
            value={row.targetResolutionDate ? formatDate(row.targetResolutionDate) : "—"}
          />
          <DetailField
            label="Last Updated"
            value={
              row.actualResolutionDate
                ? formatDate(row.actualResolutionDate)
                : formatDate(row.raisedDate)
            }
          />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="🔧 RESOLUTION PROGRESS">
        <DetailField label="Current Status" value={dash(row.rootCause)} />
        <div className="mt-3">
          <DetailField label="Resolution Plan" value={dash(row.resolutionNotes)} />
        </div>
      </MockupSection>
    </MockupDetailChrome>
  );
}
