"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
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
import { BookingEditModal } from "@/components/booking/BookingEditModal";
import { safeFetchJson, loadJsonEffect } from "@/lib/safe-fetch";
import { canEdit as sessionCanEdit, type SessionUser } from "@/lib/auth/roles";
import { formatDate, cn } from "@/lib/utils";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { AlertOctagon, Calendar, LayoutDashboard, List, Package, Pencil, Trash2 } from "lucide-react";

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
  const [user, setUser] = useState<SessionUser | null>(null);
  const canEdit = sessionCanEdit(user);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const [detail, list] = await Promise.all([
        safeFetchJson<BookingDetail>(`/api/bookings/${id}`, {
          signal,
          label: "booking-detail",
          rejectHttpErrors: false,
        }),
        safeFetchJson<BookingOption[]>("/api/bookings", { signal, label: "bookings-list" }),
      ]);
      if (signal?.aborted) return;
      setRow(detail.ok && detail.status < 300 ? detail.data : null);
      setOptions(list.ok ? list.data.map((b) => ({ id: b.id, bookingCode: b.bookingCode })) : []);
      setLastRefresh(new Date());
      setLoading(false);
    },
    [id]
  );

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  useEffect(() => {
    return loadJsonEffect<{ user: SessionUser }>("/api/auth/me", (data) => setUser(data.user), {
      label: "booking-detail-auth",
    });
  }, []);

  const selectOptions = useMemo(
    () =>
      [...options]
        .filter((o) => o.bookingCode)
        .sort((a, b) => String(a.bookingCode).localeCompare(String(b.bookingCode), undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.bookingCode! })),
    [options]
  );

  const onDelete = async () => {
    if (!row) return;
    const label = row.bookingCode || "this booking";
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setDeleting(true);
    setActionError(null);
    const result = await safeFetchJson(`/api/bookings/${row.id}`, {
      method: "DELETE",
      label: "delete-booking",
      rejectHttpErrors: false,
    });
    setDeleting(false);
    if (!result.ok || result.status >= 300) {
      setActionError("Failed to delete booking");
      return;
    }
    router.push("/booking");
  };

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading booking…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Booking not found.</p>;

  const code = row.bookingCode ?? row.id;

  return (
    <>
      <MockupDetailChrome
        pageTitle="🖥️ ENVIRONMENT BOOKING DETAIL PAGE"
        entityCode={code}
        selectLabel="Select Booking"
        selectValue={row.id}
        selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: code }]}
        onSelectChange={(v) => v !== row.id && router.push(`/booking/${v}`)}
        lastRefresh={lastRefresh}
        footer="Env Booking Page v1.0 | Data sourced from Env booking sheet"
        headerActions={
          canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={cn(taBtnSecondary, "text-sm !py-1.5")}
                onClick={() => {
                  setActionError(null);
                  setEditOpen(true);
                }}
              >
                <Pencil className="mr-1 inline h-3.5 w-3.5" />
                Edit
              </button>
              <button
                type="button"
                className={cn(
                  taBtnPrimary,
                  "text-sm !py-1.5 !bg-rose-600 hover:!bg-rose-700 dark:!bg-rose-600 dark:hover:!bg-rose-500"
                )}
                onClick={() => void onDelete()}
                disabled={deleting}
              >
                <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          ) : null
        }
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
        {actionError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            {actionError}
          </p>
        ) : null}

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
                  <ProgressLink
                    href={`/releases/${row.release.id}`}
                    className="font-mono text-brand-600 hover:underline dark:text-brand-400"
                  >
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
                  <ProgressLink
                    href={`/releases/${row.release.id}`}
                    className="font-mono text-brand-600 hover:underline dark:text-brand-400"
                  >
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

      <BookingEditModal
        open={editOpen}
        bookingId={row.id}
        bookingCode={code}
        onClose={() => setEditOpen(false)}
        onSaved={() => void load()}
        initial={{
          releaseId: row.release?.id ?? "",
          releaseSize: row.releaseSize ?? "",
          dependencies: row.dependencies ?? "",
          purpose: row.purpose ?? "",
          prodReleaseDate: row.prodReleaseDate ?? "",
          cabDate: row.cabDate ?? "",
          testEnvCode: row.testEnvCode ?? "",
          testStart: row.testStart ?? "",
          testEnd: row.testEnd ?? "",
          uatEnvCode: row.uatEnvCode ?? "",
          uatStart: row.uatStart ?? "",
          uatEnd: row.uatEnd ?? "",
          preProdEnvCode: row.preProdEnvCode ?? "",
          preProdStart: row.preProdStart ?? "",
          preProdEnd: row.preProdEnd ?? "",
          conflictFlag: row.conflictFlag,
          environmentConflictId: row.environmentConflictId ?? "",
        }}
      />
    </>
  );
}
