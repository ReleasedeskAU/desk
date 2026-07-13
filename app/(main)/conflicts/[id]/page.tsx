"use client";

import { use, useEffect, useState } from "react";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { safeFetchJson } from "@/lib/safe-fetch";
import { cn } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";
import { CalendarCheck, Package } from "lucide-react";

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
  relatedBookings: {
    id: string;
    bookingCode: string | null;
    application: string;
    department: string | null;
    conflictFlag: boolean;
    release: { id: string; releaseCode: string } | null;
  }[];
};

const PRIORITY_CLASSES: Record<string, string> = {
  "P1 - Critical": "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
  "P2 - High": "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  "P3 - Medium": "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
};

export default function ConflictDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [row, setRow] = useState<ConflictDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<ConflictDetail>(`/api/conflicts/${id}`, {
        signal: ac.signal,
        label: "conflict-detail",
        rejectHttpErrors: false,
      });
      if (ac.signal.aborted) return;
      setRow(result.ok && result.status < 300 ? result.data : null);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [id]);

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading conflict…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Conflict not found.</p>;

  return (
    <DetailPageShell
      entityCode={row.conflictCode}
      title={`${row.conflictCode} — Conflict`}
      subtitle={`${row.department} · ${row.application} · ${row.conflictingEnvironment}`}
      backHref="/conflicts"
      backLabel="Back to Conflicts"
      badges={
        <>
          <StatusBadge status={row.status} />
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-bold", PRIORITY_CLASSES[row.priority] ?? "")}>
            {row.priority}
          </span>
        </>
      }
      actions={
        <>
          {row.release1 && (
            <ProgressLink href={`/releases/${row.release1.id}`} className={taBtnSecondary + " text-sm !py-2"}>
              <Package className="h-4 w-4 inline mr-1" /> {row.release1.releaseCode}
            </ProgressLink>
          )}
          {row.release2 && (
            <ProgressLink href={`/releases/${row.release2.id}`} className={taBtnSecondary + " text-sm !py-2"}>
              <Package className="h-4 w-4 inline mr-1" /> {row.release2.releaseCode}
            </ProgressLink>
          )}
        </>
      }
    >
      <AdvancedCard title="Overview">
        <DetailFieldGrid>
          <DetailField label="Conflict ID" value={row.conflictCode} />
          <DetailField label="Status" value={row.status} />
          <DetailField label="Priority" value={row.priority} />
          <DetailField label="Assigned To" value={row.assignedTo || "—"} />
          <DetailField label="Environment Conflict Type" value={row.environmentConflictType} />
          <DetailField label="Conflicting Environment" value={row.conflictingEnvironment} />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Affected releases">
        <DetailFieldGrid>
          <DetailField
            label="Release 1"
            value={
              row.release1 ? (
                <ProgressLink href={`/releases/${row.release1.id}`} className="text-brand-600 hover:underline dark:text-brand-400">
                  {row.release1.releaseCode} — {row.release1.name}
                </ProgressLink>
              ) : (
                row.release1Code
              )
            }
          />
          <DetailField
            label="Release 2"
            value={
              row.release2 ? (
                <ProgressLink href={`/releases/${row.release2.id}`} className="text-brand-600 hover:underline dark:text-brand-400">
                  {row.release2.releaseCode} — {row.release2.name}
                </ProgressLink>
              ) : (
                row.release2Code
              )
            }
          />
        </DetailFieldGrid>
      </AdvancedCard>

      <AdvancedCard title="Scope">
        <DetailFieldGrid>
          <DetailField label="Application" value={row.application} />
          <DetailField label="Department" value={row.department} />
        </DetailFieldGrid>
        {row.notes ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-white/75 border-t border-gray-100 dark:border-[var(--border)] pt-3">
            {row.notes}
          </p>
        ) : null}
      </AdvancedCard>

      <AdvancedCard title="Related environment bookings" icon={CalendarCheck}>
        {row.relatedBookings.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-white/60">No bookings reference this conflict ID.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {row.relatedBookings.map((b) => (
              <li key={b.id} className="text-gray-700 dark:text-white/80">
                <ProgressLink href={`/booking/${b.id}`} className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400">
                  {b.bookingCode ?? b.id}
                </ProgressLink>
                {" · "}
                {b.application}
                {b.release ? (
                  <>
                    {" · "}
                    <ProgressLink href={`/releases/${b.release.id}`} className="text-brand-600 hover:underline dark:text-brand-400">
                      {b.release.releaseCode}
                    </ProgressLink>
                  </>
                ) : null}
                {b.conflictFlag ? <span className="ml-2 text-error-600 dark:text-rose-400">Conflict</span> : null}
              </li>
            ))}
          </ul>
        )}
      </AdvancedCard>
    </DetailPageShell>
  );
}
