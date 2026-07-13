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
import { Calendar, List, Mail, Package, Pencil } from "lucide-react";

type MaintenanceDetail = {
  id: string;
  maintenanceCode: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  type: string;
  environmentName: string;
  departmentName: string | null;
  impact: string;
  requestor: string | null;
  approvalStatus: string;
  notes: string | null;
  application: { id: string; name: string } | null;
};

type MaintenanceOption = { id: string; maintenanceCode: string };

function statusTone(status: string): "good" | "warn" | "bad" | "neutral" {
  const s = status.toLowerCase();
  if (s.includes("approv") || s.includes("complete")) return "good";
  if (s.includes("schedul") || s.includes("pending")) return "warn";
  if (s.includes("cancel") || s.includes("reject")) return "bad";
  return "neutral";
}

function impactTone(impact: string): "bad" | "warn" | "neutral" | "good" {
  const s = impact.toLowerCase();
  if (s.includes("critical") || s.includes("high")) return "bad";
  if (s.includes("medium")) return "warn";
  if (s.includes("low")) return "good";
  return "neutral";
}

function windowLabel(dateIso: string, time: string) {
  const date = formatDate(dateIso);
  return time ? `${date} ${time}` : date;
}

export default function MaintenanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<MaintenanceDetail | null>(null);
  const [options, setOptions] = useState<MaintenanceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [detail, list] = await Promise.all([
        safeFetchJson<MaintenanceDetail>(`/api/planned-maintenance/${id}`, {
          signal: ac.signal,
          label: "maintenance-detail",
          rejectHttpErrors: false,
        }),
        safeFetchJson<MaintenanceOption[]>("/api/planned-maintenance", {
          signal: ac.signal,
          label: "maintenance-list",
        }),
      ]);
      if (ac.signal.aborted) return;
      setRow(detail.ok && detail.status < 300 ? detail.data : null);
      setOptions(
        list.ok ? list.data.map((m) => ({ id: m.id, maintenanceCode: m.maintenanceCode })) : []
      );
      setLastRefresh(new Date());
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) =>
          a.maintenanceCode.localeCompare(b.maintenanceCode, undefined, { numeric: true })
        )
        .map((o) => ({ value: o.id, label: o.maintenanceCode })),
    [options]
  );

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading maintenance…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Maintenance not found.</p>;

  return (
    <MockupDetailChrome
      pageTitle="🔧 MAINTENANCE DETAIL PAGE"
      entityCode={row.maintenanceCode}
      selectLabel="Select Maintenance"
      selectValue={row.id}
      selectOptions={
        selectOptions.length ? selectOptions : [{ value: row.id, label: row.maintenanceCode }]
      }
      onSelectChange={(v) => v !== row.id && router.push(`/planned-maintenance/${v}`)}
      lastRefresh={lastRefresh}
      footer="Maintenance Page v1.0 | Data sourced from Planned Maintenance sheet | Vendor & infrastructure maintenance windows"
      quickActions={[
        { href: "/calendar", label: "📅 View Calendar", icon: <Calendar className="mr-1 inline h-4 w-4" /> },
        { href: "/releases", label: "📋 View Releases", icon: <Package className="mr-1 inline h-4 w-4" /> },
        {
          href: `/planned-maintenance/${row.id}`,
          label: "📧 Notify Teams",
          icon: <Mail className="mr-1 inline h-4 w-4" />,
        },
        {
          href: `/planned-maintenance/${row.id}`,
          label: "✏️ Reschedule",
          icon: <Pencil className="mr-1 inline h-4 w-4" />,
        },
        {
          href: "/planned-maintenance",
          label: "🔙 All Maintenance",
          icon: <List className="mr-1 inline h-4 w-4" />,
        },
      ]}
    >
      <MockupSection title="🚦 MAINTENANCE STATUS AT A GLANCE">
        <GlanceStrip
          items={[
            {
              label: "Status",
              value: <StatusBadge status={row.approvalStatus} />,
              tone: statusTone(row.approvalStatus),
            },
            { label: "Type", value: dash(row.type) },
            { label: "Impact", value: dash(row.impact), tone: impactTone(row.impact) },
          ]}
        />
      </MockupSection>

      <MockupSection title="📋 MAINTENANCE INFORMATION">
        <DetailFieldGrid cols={2}>
          <DetailField label="Maintenance ID" value={row.maintenanceCode} />
          <DetailField label="Vendor" value={dash(row.requestor)} />
        </DetailFieldGrid>
        <div className="mt-3">
          <DetailField label="Description" value={dash(row.notes ?? row.type)} />
        </div>
      </MockupSection>

      <MockupSection title="📅 MAINTENANCE WINDOW">
        <DetailFieldGrid cols={2}>
          <DetailField label="Start Time" value={windowLabel(row.scheduledDate, row.startTime)} />
          <DetailField label="End Time" value={windowLabel(row.scheduledDate, row.endTime)} />
          <DetailField label="Duration" value="—" />
          <DetailField label="Timezone" value="—" />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="💻 AFFECTED SYSTEMS">
        <DetailFieldGrid cols={2}>
          <DetailField label="System" value={dash(row.application?.name)} />
          <DetailField label="Environment" value={dash(row.environmentName)} />
          <DetailField label="Services Affected" value={dash(row.departmentName)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="⚠️ RELEASE IMPACT">
        <DetailField label="Blocked Releases" value="—" />
        <div className="mt-3">
          <DetailField label="Impact Notes" value={dash(row.impact)} />
        </div>
      </MockupSection>

      <MockupSection title="📝 NOTES">
        <DetailField label="Notes" value={dash(row.notes)} />
      </MockupSection>
    </MockupDetailChrome>
  );
}
