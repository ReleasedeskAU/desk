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
import { AlertOctagon, Calendar, LayoutDashboard, List, Package } from "lucide-react";

type BookingDetail = {
  id: string;
  bookingCode: string | null;
  application: { id: string; name: string };
  release: { id: string; releaseCode: string; name?: string } | null;
  departmentName: string | null;
  dependencies: string | null;
  releaseSize: string | null;
  prodReleaseDate: string | null;
  cabDate: string | null;
  testEnvCode: string | null;
  testStart: string | null;
  testEnd: string | null;
  testDays: number | null;
  uatEnvCode: string | null;
  uatStart: string | null;
  uatEnd: string | null;
  uatDays: number | null;
  preProdEnvCode: string | null;
  preProdStart: string | null;
  preProdEnd: string | null;
  preProdDays: number | null;
  conflictFlag: boolean;
  environmentConflictId: string | null;
  purpose: string | null;
  conflicts: { id: string; conflictCode: string; status: string; priority: string }[];
};

type BookingOption = { id: string; bookingCode: string | null };

function d(value: string | null | undefined) {
  return value ? formatDate(value) : "—";
}

function ConflictLinks({ raw, conflicts }: { raw: string | null; conflicts: BookingDetail["conflicts"] }) {
  const codes = (raw ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!codes.length) return <>{dash(raw)}</>;
  return (
    <span className="inline-flex flex-wrap gap-x-1">
      {codes.map((code, i) => {
        const hit = conflicts.find((c) => c.conflictCode === code);
        return (
          <span key={code}>
            {i > 0 && <span className="text-gray-400 mr-1">,</span>}
            <ProgressLink
              href={`/conflicts/${hit?.id ?? encodeURIComponent(code)}`}
              className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
            >
              {code}
            </ProgressLink>
          </span>
        );
      })}
    </span>
  );
}

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<BookingDetail | null>(null);
  const [options, setOptions] = useState<BookingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [detail, list] = await Promise.all([
        safeFetchJson<BookingDetail>(`/api/bookings/${id}`, {
          signal: ac.signal,
          label: "booking-detail",
          rejectHttpErrors: false,
        }),
        safeFetchJson<BookingOption[]>("/api/bookings", { signal: ac.signal, label: "bookings-list" }),
      ]);
      if (ac.signal.aborted) return;
      setRow(detail.ok && detail.status < 300 ? detail.data : null);
      setOptions(list.ok ? list.data.map((b) => ({ id: b.id, bookingCode: b.bookingCode })) : []);
      setLastRefresh(new Date());
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  const selectOptions = useMemo(
    () =>
      [...options]
        .filter((o) => o.bookingCode)
        .sort((a, b) => String(a.bookingCode).localeCompare(String(b.bookingCode), undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.bookingCode! })),
    [options]
  );

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading booking…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Booking not found.</p>;

  const code = row.bookingCode ?? row.id;

  return (
    <MockupDetailChrome
      pageTitle="🖥️ ENVIRONMENT BOOKING DETAIL PAGE"
      entityCode={code}
      selectLabel="Select Booking"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: code }]}
      onSelectChange={(v) => v !== row.id && router.push(`/booking/${v}`)}
      lastRefresh={lastRefresh}
      footer="Env Booking Page v1.0 | Data sourced from Env booking sheet"
      quickActions={[
        { href: "/calendar", label: "📅 View Calendar", icon: <Calendar className="mr-1 inline h-4 w-4" /> },
        ...(row.release
          ? [{ href: `/releases/${row.release.id}`, label: "📋 View Release", icon: <Package className="mr-1 inline h-4 w-4" /> }]
          : []),
        ...(row.conflicts[0]
          ? [
              {
                href: `/conflicts/${row.conflicts[0].id}`,
                label: "⚠️ View Conflict",
                icon: <AlertOctagon className="mr-1 inline h-4 w-4" />,
              },
            ]
          : row.environmentConflictId
            ? [
                {
                  href: `/conflicts/${encodeURIComponent(row.environmentConflictId.split(",")[0].trim())}`,
                  label: "⚠️ View Conflict",
                  icon: <AlertOctagon className="mr-1 inline h-4 w-4" />,
                },
              ]
            : []),
        { href: "/dashboard", label: "📊 Dashboard", icon: <LayoutDashboard className="mr-1 inline h-4 w-4" /> },
        { href: "/booking", label: "🔙 All Bookings", icon: <List className="mr-1 inline h-4 w-4" /> },
      ]}
    >
      <MockupSection title="🚦 Booking Status at a Glance">
        <GlanceStrip
          items={[
            {
              label: "Conflict Flag",
              value: row.conflictFlag ? "⚠️ CONFLICT" : "Clear",
              tone: row.conflictFlag ? "warn" : "good",
            },
            {
              label: "Release ID",
              value: row.release ? (
                <ProgressLink href={`/releases/${row.release.id}`} className="font-mono text-brand-600 hover:underline dark:text-brand-400">
                  {row.release.releaseCode}
                </ProgressLink>
              ) : (
                "—"
              ),
            },
            { label: "Application", value: row.application.name },
          ]}
        />
      </MockupSection>

      <MockupSection title="📦 Release Information">
        <DetailFieldGrid cols={2}>
          <DetailField
            label="Release ID"
            value={
              row.release ? (
                <ProgressLink href={`/releases/${row.release.id}`} className="font-mono text-brand-600 hover:underline dark:text-brand-400">
                  {row.release.releaseCode}
                </ProgressLink>
              ) : (
                "—"
              )
            }
          />
          <DetailField label="Application" value={row.application.name} />
          <DetailField label="Department" value={dash(row.departmentName)} />
          <DetailField label="Release Size" value={dash(row.releaseSize)} />
          <DetailField label="Dependencies" value={dash(row.dependencies ?? "NA")} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="📅 Key Dates">
        <DetailFieldGrid cols={2}>
          <DetailField label="Prod Release Date" value={d(row.prodReleaseDate)} />
          <DetailField label="CAB Date" value={d(row.cabDate)} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="🧪 Test Environment">
        <DetailFieldGrid cols={3}>
          <DetailField label="Test Env" value={dash(row.testEnvCode)} />
          <DetailField label="Test Start" value={d(row.testStart)} />
          <DetailField label="Test End" value={d(row.testEnd)} />
          <DetailField label="Test Days" value={row.testDays ?? "—"} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="✅ UAT Environment">
        <DetailFieldGrid cols={3}>
          <DetailField label="UAT Env" value={dash(row.uatEnvCode)} />
          <DetailField label="UAT Start" value={d(row.uatStart)} />
          <DetailField label="UAT End" value={d(row.uatEnd)} />
          <DetailField label="UAT Days" value={row.uatDays ?? "—"} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="🚀 Pre-Prod Environment">
        <DetailFieldGrid cols={3}>
          <DetailField label="Pre-Prod Env" value={dash(row.preProdEnvCode)} />
          <DetailField label="Pre-Prod Start" value={d(row.preProdStart)} />
          <DetailField label="Pre-Prod End" value={d(row.preProdEnd)} />
          <DetailField label="Pre-Prod Days" value={row.preProdDays ?? "—"} />
        </DetailFieldGrid>
      </MockupSection>

      <MockupSection title="⚠️ Conflict Details">
        <DetailFieldGrid cols={2}>
          <DetailField
            label="Conflict ID"
            value={<ConflictLinks raw={row.environmentConflictId} conflicts={row.conflicts} />}
          />
          <DetailField label="Notes" value={dash(row.purpose)} />
        </DetailFieldGrid>
      </MockupSection>
    </MockupDetailChrome>
  );
}
