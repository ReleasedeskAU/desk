"use client";

import { use, useEffect, useState } from "react";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";
import { AlertOctagon, Package } from "lucide-react";

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

function d(value: string | null | undefined) {
  return value ? formatDate(value) : "—";
}

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [row, setRow] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<BookingDetail>(`/api/bookings/${id}`, {
        signal: ac.signal,
        label: "booking-detail",
        rejectHttpErrors: false,
      });
      if (ac.signal.aborted) return;
      setRow(result.ok && result.status < 300 ? result.data : null);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading booking…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Booking not found.</p>;

  const code = row.bookingCode ?? row.id;

  return (
    <DetailPageShell
      entityCode={code}
      title={`${code} — Env Booking`}
      subtitle={`${row.application.name}${row.departmentName ? ` · ${row.departmentName}` : ""}${row.release ? ` · ${row.release.releaseCode}` : ""}`}
      backHref="/booking"
      backLabel="Back to Env Booking"
      badges={
        row.conflictFlag ? (
          <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-500/20 dark:text-rose-300">
            Conflict
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
            Clear
          </span>
        )
      }
      actions={
        <>
          {row.release && (
            <ProgressLink href={`/releases/${row.release.id}`} className={taBtnSecondary + " text-sm !py-2"}>
              <Package className="h-4 w-4 inline mr-1" /> {row.release.releaseCode}
            </ProgressLink>
          )}
          {row.conflicts[0] && (
            <ProgressLink href={`/conflicts/${row.conflicts[0].id}`} className={taBtnSecondary + " text-sm !py-2"}>
              <AlertOctagon className="h-4 w-4 inline mr-1" /> {row.conflicts[0].conflictCode}
            </ProgressLink>
          )}
        </>
      }
    >
      <AdvancedCard title="Release context">
        <DetailFieldGrid>
          <DetailField label="Booking ID" value={code} />
          <DetailField
            label="Release ID"
            value={
              row.release ? (
                <ProgressLink href={`/releases/${row.release.id}`} className="text-brand-600 hover:underline dark:text-brand-400">
                  {row.release.releaseCode}
                </ProgressLink>
              ) : (
                "—"
              )
            }
          />
          <DetailField label="Application" value={row.application.name} />
          <DetailField label="Department" value={row.departmentName ?? "—"} />
          <DetailField label="Dependencies" value={row.dependencies || "NA"} />
          <DetailField label="Release Size" value={row.releaseSize ?? "—"} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Milestones">
        <DetailFieldGrid>
          <DetailField label="Prod Release Date" value={d(row.prodReleaseDate)} />
          <DetailField label="CAB Date" value={d(row.cabDate)} />
        </DetailFieldGrid>
      </AdvancedCard>

      <div className="grid gap-6 lg:grid-cols-3">
        <AdvancedCard title="Test phase">
          <DetailFieldGrid>
            <DetailField label="Test Env" value={row.testEnvCode ?? "—"} />
            <DetailField label="Test Start" value={d(row.testStart)} />
            <DetailField label="Test End" value={d(row.testEnd)} />
            <DetailField label="Test Days" value={row.testDays ?? "—"} />
          </DetailFieldGrid>
        </AdvancedCard>
        <AdvancedCard title="UAT phase">
          <DetailFieldGrid>
            <DetailField label="UAT Env" value={row.uatEnvCode ?? "—"} />
            <DetailField label="UAT Start" value={d(row.uatStart)} />
            <DetailField label="UAT End" value={d(row.uatEnd)} />
            <DetailField label="UAT Days" value={row.uatDays ?? "—"} />
          </DetailFieldGrid>
        </AdvancedCard>
        <AdvancedCard title="Pre-Prod phase">
          <DetailFieldGrid>
            <DetailField label="Pre-Prod Env" value={row.preProdEnvCode ?? "—"} />
            <DetailField label="Pre-Prod Start" value={d(row.preProdStart)} />
            <DetailField label="Pre-Prod End" value={d(row.preProdEnd)} />
            <DetailField label="Pre-Prod Days" value={row.preProdDays ?? "—"} />
          </DetailFieldGrid>
        </AdvancedCard>
      </div>

      <AdvancedCard title="Conflict linkage" icon={AlertOctagon}>
        <DetailFieldGrid>
          <DetailField label="Conflict Flag" value={row.conflictFlag ? "Yes" : "No"} />
          <DetailField
            label="Environment Conflict ID"
            value={
              row.conflicts.length > 0 ? (
                <span className="inline-flex flex-wrap gap-2">
                  {row.conflicts.map((c) => (
                    <ProgressLink
                      key={c.id}
                      href={`/conflicts/${c.id}`}
                      className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {c.conflictCode}
                    </ProgressLink>
                  ))}
                </span>
              ) : row.environmentConflictId ? (
                <span className="inline-flex flex-wrap items-center gap-x-1">
                  {row.environmentConflictId
                    .split(",")
                    .map((c) => c.trim())
                    .filter(Boolean)
                    .map((code, i) => (
                      <span key={code} className="inline-flex items-center">
                        {i > 0 && <span className="text-gray-400 mr-1">,</span>}
                        <ProgressLink
                          href={`/conflicts/${encodeURIComponent(code)}`}
                          className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
                        >
                          {code}
                        </ProgressLink>
                      </span>
                    ))}
                </span>
              ) : (
                "—"
              )
            }
          />
        </DetailFieldGrid>
      </AdvancedCard>

      {row.purpose ? (
        <AdvancedCard title="Notes">
          <p className="text-sm text-gray-700 dark:text-white/80">{row.purpose}</p>
        </AdvancedCard>
      ) : null}
    </DetailPageShell>
  );
}
