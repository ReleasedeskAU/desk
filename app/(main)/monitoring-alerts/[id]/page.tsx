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
import { formatDateTime } from "@/lib/utils";
import { CheckCircle, LayoutDashboard, List, Mail, Package } from "lucide-react";

type AlertDetail = {
  id: string;
  alertCode: string;
  timestamp: string;
  departmentName: string | null;
  alertType: string;
  severity: string;
  metric: string;
  threshold: string | null;
  currentValue: string | null;
  status: string;
  assignedTo: string | null;
  environmentName: string;
  application: { id: string; name: string };
};

type AlertOption = { id: string; alertCode: string };

function severityTone(severity: string): "bad" | "warn" | "neutral" | "good" {
  const s = severity.toLowerCase();
  if (s.includes("critical")) return "bad";
  if (s.includes("high") || s.includes("warning")) return "warn";
  if (s.includes("low") || s.includes("info")) return "good";
  return "neutral";
}

function severityLabel(severity: string) {
  const s = severity.toLowerCase();
  if (s.includes("critical")) return `🔴 ${severity}`;
  if (s.includes("high")) return `🔴 ${severity}`;
  if (s.includes("medium") || s.includes("warning")) return `🟡 ${severity}`;
  if (s.includes("low") || s.includes("info")) return `🟢 ${severity}`;
  return severity;
}

export default function MonitoringAlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<AlertDetail | null>(null);
  const [options, setOptions] = useState<AlertOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [detail, list] = await Promise.all([
        safeFetchJson<AlertDetail>(`/api/monitoring-alerts/${id}`, {
          signal: ac.signal,
          label: "alert-detail",
          rejectHttpErrors: false,
        }),
        safeFetchJson<AlertOption[]>("/api/monitoring-alerts", {
          signal: ac.signal,
          label: "alerts-list",
        }),
      ]);
      if (ac.signal.aborted) return;
      setRow(detail.ok && detail.status < 300 ? detail.data : null);
      setOptions(list.ok ? list.data.map((a) => ({ id: a.id, alertCode: a.alertCode })) : []);
      setLastRefresh(new Date());
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.alertCode.localeCompare(b.alertCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.alertCode })),
    [options]
  );

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading alert…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Alert not found.</p>;

  return (
    <MockupDetailChrome
      pageTitle="🔔 ALERT DETAIL PAGE"
      entityCode={row.alertCode}
      selectLabel="Select Alert"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: row.alertCode }]}
      onSelectChange={(v) => v !== row.id && router.push(`/monitoring-alerts/${v}`)}
      lastRefresh={lastRefresh}
      footer="Alert Page v1.0 | Data sourced from Monitoring Alerts sheet | System alert & incident correlation"
      quickActions={[
        { href: "/releases", label: "📋 View Release", icon: <Package className="mr-1 inline h-4 w-4" /> },
        {
          href: "/monitoring-alerts",
          label: "📊 View Metrics",
          icon: <LayoutDashboard className="mr-1 inline h-4 w-4" />,
        },
        {
          href: `/monitoring-alerts/${row.id}`,
          label: "🔄 Acknowledge",
          icon: <CheckCircle className="mr-1 inline h-4 w-4" />,
        },
        {
          href: `/monitoring-alerts/${row.id}`,
          label: "📧 Escalate",
          icon: <Mail className="mr-1 inline h-4 w-4" />,
        },
        { href: "/monitoring-alerts", label: "🔙 All Alerts", icon: <List className="mr-1 inline h-4 w-4" /> },
      ]}
    >
      <MockupSection title="🚦 ALERT STATUS AT A GLANCE">
        <GlanceStrip
          items={[
            {
              label: "Severity",
              value: severityLabel(row.severity),
              tone: severityTone(row.severity),
            },
            { label: "Status", value: <StatusBadge status={row.status} /> },
            { label: "Alert Type", value: dash(row.alertType) },
          ]}
        />
      </MockupSection>

      <MockupSection title="📋 ALERT INFORMATION">
        <DetailFieldGrid cols={2}>
          <DetailField label="Alert ID" value={row.alertCode} />
          <DetailField label="Alert Name" value={dash(row.metric)} />
          <DetailField label="Application" value={dash(row.application.name)} />
          <DetailField label="Environment" value={dash(row.environmentName)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="📊 METRIC DETAILS">
        <DetailFieldGrid cols={2}>
          <DetailField label="Metric" value={dash(row.metric)} />
          <DetailField label="Current Value" value={dash(row.currentValue)} />
          <DetailField label="Threshold" value={dash(row.threshold)} />
          <DetailField label="Triggered At" value={formatDateTime(row.timestamp)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="🔗 LINKED RELEASE">
        <DetailFieldGrid cols={2}>
          <DetailField label="Release ID" value="—" />
          <DetailField label="Release Name" value="—" />
          <DetailField label="Correlation" value="—" />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="🔧 RESOLUTION">
        <DetailFieldGrid cols={2}>
          <DetailField label="Assigned To" value={dash(row.assignedTo)} />
          <DetailField label="Priority" value="—" />
          <DetailField label="Actions Taken" value="—" />
        </DetailFieldGrid>
      </MockupSection>
    </MockupDetailChrome>
  );
}
