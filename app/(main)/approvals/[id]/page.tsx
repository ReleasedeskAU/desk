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
import { Calendar, List, Mail, MessageSquare, Package } from "lucide-react";

type ApprovalDetail = {
  id: string;
  approvalCode: string;
  applicationName: string | null;
  departmentName: string | null;
  approvalType: string;
  submittedDate: string;
  decisionDate: string | null;
  decision: string;
  comments: string | null;
  cabMeetingId: string | null;
  release: { id: string; releaseCode: string; name: string; status: string; releaseDate: string };
  approver: { id: string; userId: string; name: string; email: string; role: string };
};

type ApprovalOption = { id: string; approvalCode: string };

function decisionTone(decision: string): "good" | "warn" | "bad" | "neutral" {
  const d = decision.toLowerCase();
  if (d.includes("approv")) return "good";
  if (d.includes("reject") || d.includes("denied")) return "bad";
  if (d.includes("pending")) return "warn";
  return "neutral";
}

export default function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<ApprovalDetail | null>(null);
  const [options, setOptions] = useState<ApprovalOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [detail, list] = await Promise.all([
        safeFetchJson<ApprovalDetail>(`/api/approvals/${id}`, {
          signal: ac.signal,
          label: "approval-detail",
          rejectHttpErrors: false,
        }),
        safeFetchJson<ApprovalOption[]>("/api/approvals", {
          signal: ac.signal,
          label: "approvals-list",
        }),
      ]);
      if (ac.signal.aborted) return;
      setRow(detail.ok && detail.status < 300 ? detail.data : null);
      setOptions(list.ok ? list.data.map((a) => ({ id: a.id, approvalCode: a.approvalCode })) : []);
      setLastRefresh(new Date());
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.approvalCode.localeCompare(b.approvalCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.approvalCode })),
    [options]
  );

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading approval…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Approval not found.</p>;

  return (
    <MockupDetailChrome
      pageTitle="✅ APPROVAL DETAIL PAGE"
      entityCode={row.approvalCode}
      selectLabel="Select Approval"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: row.approvalCode }]}
      onSelectChange={(v) => v !== row.id && router.push(`/approvals/${v}`)}
      lastRefresh={lastRefresh}
      footer="Approvals Page v1.0 | Data sourced from Approvals sheet | CAB & sign-off workflow tracking"
      quickActions={[
        {
          href: `/releases/${row.release.id}`,
          label: "📋 View Release",
          icon: <Package className="mr-1 inline h-4 w-4" />,
        },
        { href: "/calendar", label: "📅 View CAB", icon: <Calendar className="mr-1 inline h-4 w-4" /> },
        {
          href: `/approvals/${row.id}`,
          label: "✏️ Add Comment",
          icon: <MessageSquare className="mr-1 inline h-4 w-4" />,
        },
        { href: `/approvals/${row.id}`, label: "📧 Notify", icon: <Mail className="mr-1 inline h-4 w-4" /> },
        { href: "/approvals", label: "🔙 All Approvals", icon: <List className="mr-1 inline h-4 w-4" /> },
      ]}
    >
      <MockupSection title="🚦 APPROVAL STATUS AT A GLANCE">
        <GlanceStrip
          items={[
            {
              label: "Decision",
              value: <StatusBadge status={row.decision} />,
              tone: decisionTone(row.decision),
            },
            { label: "Approval Type", value: dash(row.approvalType) },
            { label: "CAB Meeting", value: dash(row.cabMeetingId) },
          ]}
        />
      </MockupSection>

      <MockupSection title="📦 RELEASE INFORMATION">
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
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="👤 APPROVER DETAILS">
        <DetailFieldGrid cols={2}>
          <DetailField label="Approver ID" value={dash(row.approver.userId)} />
          <DetailField label="Approver Name" value={dash(row.approver.name)} />
          <DetailField label="Approver Role" value={dash(row.approver.role)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="📅 TIMELINE">
        <DetailFieldGrid cols={2}>
          <DetailField label="Submitted Date" value={formatDate(row.submittedDate)} />
          <DetailField
            label="Decision Date"
            value={row.decisionDate ? formatDate(row.decisionDate) : "—"}
          />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="💬 COMMENTS">
        <DetailField label="Comments" value={dash(row.comments)} />
      </MockupSection>
    </MockupDetailChrome>
  );
}
