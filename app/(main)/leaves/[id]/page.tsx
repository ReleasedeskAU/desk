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
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { List, Mail, Package, Pencil, User } from "lucide-react";

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

type LeaveOption = { id: string; leaveCode: string };

function scoreBand(score: number) {
  if (score <= 3) return { label: "Low", tone: "good" as const };
  if (score <= 6) return { label: "Medium", tone: "warn" as const };
  if (score <= 9) return { label: "High", tone: "bad" as const };
  return { label: "Critical", tone: "bad" as const };
}

function coverageFromRisk(riskImpact: string | null, riskScore: number) {
  const text = (riskImpact ?? "").toLowerCase();
  if (text.includes("covered") && !text.includes("uncovered")) return { label: "🟢 Covered", tone: "good" as const };
  if (text.includes("partial") || text.includes("backup")) return { label: "🟡 Partial", tone: "warn" as const };
  if (text.includes("uncover") || text.includes("no cover") || text.includes("unavailable")) {
    return { label: "🔴 Uncovered", tone: "bad" as const };
  }
  if (riskScore <= 3) return { label: "🟢 Covered", tone: "good" as const };
  if (riskScore <= 6) return { label: "🟡 Partial", tone: "warn" as const };
  return { label: "🔴 Uncovered", tone: "bad" as const };
}

export default function LeaveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<LeaveDetail | null>(null);
  const [options, setOptions] = useState<LeaveOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [detail, list] = await Promise.all([
        safeFetchJson<LeaveDetail>(`/api/leaves/${id}`, {
          signal: ac.signal,
          label: "leave-detail",
          rejectHttpErrors: false,
        }),
        safeFetchJson<LeaveOption[]>("/api/leaves", { signal: ac.signal, label: "leaves-list" }),
      ]);
      if (ac.signal.aborted) return;
      setRow(detail.ok && detail.status < 300 ? detail.data : null);
      setOptions(list.ok ? list.data.map((l) => ({ id: l.id, leaveCode: l.leaveCode })) : []);
      setLastRefresh(new Date());
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.leaveCode.localeCompare(b.leaveCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.leaveCode })),
    [options]
  );

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading leave…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Leave record not found.</p>;

  const coverage = coverageFromRisk(row.riskImpact, row.riskScore);
  const band = scoreBand(row.riskScore);
  const firstRelease = row.affectedReleases[0]?.release;

  return (
    <MockupDetailChrome
      pageTitle="🏖️ LEAVE DETAIL PAGE"
      entityCode={row.leaveCode}
      selectLabel="Select Leave Record"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: row.leaveCode }]}
      onSelectChange={(v) => v !== row.id && router.push(`/leaves/${v}`)}
      lastRefresh={lastRefresh}
      footer="Leave Page v1.0 | Data sourced from Leave Calendar sheet | Resource availability tracking"
      quickActions={[
        {
          href: firstRelease ? `/releases/${firstRelease.id}` : "/releases",
          label: "📋 View Releases",
          icon: <Package className="mr-1 inline h-4 w-4" />,
        },
        { href: `/leaves/${row.id}`, label: "👤 View Cover", icon: <User className="mr-1 inline h-4 w-4" /> },
        {
          href: `/leaves/${row.id}`,
          label: "✏️ Update Coverage",
          icon: <Pencil className="mr-1 inline h-4 w-4" />,
        },
        { href: `/leaves/${row.id}`, label: "📧 Notify Team", icon: <Mail className="mr-1 inline h-4 w-4" /> },
        { href: "/leaves", label: "🔙 All Leave", icon: <List className="mr-1 inline h-4 w-4" /> },
      ]}
    >
      <MockupSection title="🚦 LEAVE STATUS AT A GLANCE">
        <GlanceStrip
          items={[
            { label: "Coverage Status", value: coverage.label, tone: coverage.tone },
            { label: "Risk Score", value: band.label, tone: band.tone },
            { label: "Leave Type", value: dash(row.leaveType) },
          ]}
        />
      </MockupSection>

      <MockupSection title="👤 EMPLOYEE INFORMATION">
        <DetailFieldGrid cols={2}>
          <DetailField label="Employee ID" value={dash(row.user.userId)} />
          <DetailField label="Employee Name" value={dash(row.user.name)} />
          <DetailField label="Role" value={dash(row.user.role)} />
          <DetailField label="Department" value={dash(row.user.department)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="📅 LEAVE PERIOD">
        <DetailFieldGrid cols={3}>
          <DetailField label="Start Date" value={formatDate(row.leaveStart)} />
          <DetailField label="End Date" value={formatDate(row.leaveEnd)} />
          <DetailField label="Duration" value={`${row.days} Day${row.days === 1 ? "" : "s"}`} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="⚠️ RELEASE IMPACT">
        <DetailField
          label="Affected Releases"
          value={
            row.affectedReleases.length === 0 ? (
              "—"
            ) : (
              <span className="inline-flex flex-wrap gap-x-1">
                {row.affectedReleases.map(({ release }, i) => (
                  <span key={release.id}>
                    {i > 0 && <span className="mr-1 text-gray-400">,</span>}
                    <ProgressLink
                      href={`/releases/${release.id}`}
                      className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {release.releaseCode}
                    </ProgressLink>
                  </span>
                ))}
              </span>
            )
          }
        />
        <div className="mt-3">
          <DetailField
            label="Risk Score"
            value={dash(row.riskImpact ?? `${band.label} (score ${row.riskScore})`)}
          />
        </div>
      </MockupSection>

      <MockupSection title="🔄 COVERAGE PLAN">
        <DetailFieldGrid cols={2}>
          <DetailField label="Cover ID" value="—" />
          <DetailField label="Cover Name" value="—" />
          <DetailField label="Handover Status" value="—" />
          <DetailField label="Handover Notes" value="—" />
        </DetailFieldGrid>
      </MockupSection>
    </MockupDetailChrome>
  );
}
